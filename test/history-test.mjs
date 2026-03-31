import chai from 'chai'
import sinon from 'sinon'
import sinonChai from 'sinon-chai'
import historyPlugin from '../src/history.mjs'

chai.use(sinonChai)
const expect = chai.expect

function createRobot () {
  const brainListeners = {}
  return {
    respond: sinon.spy(),
    hear: sinon.spy(),
    brain: {
      on: sinon.spy((event, cb) => {
        brainListeners[event] = cb
      }),
      emit: (event) => {
        if (brainListeners[event]) brainListeners[event]()
      },
      data: {}
    },
    logger: {
      info: sinon.spy()
    }
  }
}

function getHandler (spy, regex) {
  for (const call of spy.getCalls()) {
    if (call.args[0].toString() === regex.toString()) {
      return call.args[1]
    }
  }
  throw new Error(`No handler registered for ${regex}`)
}

function makeMsg (username, text) {
  return {
    message: { user: { name: username } },
    match: [text, text],
    send: sinon.spy()
  }
}

describe('history', () => {
  let robot

  beforeEach(() => {
    delete process.env.HUBOT_HISTORY_LINES
    robot = createRobot()
    historyPlugin(robot)
  })

  describe('listener registration', () => {
    it('registers a hear listener for all messages', () => {
      expect(robot.hear).to.have.been.calledWith(/(.*)/i)
    })

    it('registers a respond listener for show history', () => {
      expect(robot.respond).to.have.been.calledWith(/show ((\d+) lines of )?history/i)
    })

    it('registers a respond listener for clear history', () => {
      expect(robot.respond).to.have.been.calledWith(/clear history/i)
    })
  })

  describe('recording messages', () => {
    it('stores messages when heard', () => {
      const hearHandler = getHandler(robot.hear, /(.*)/i)
      hearHandler(makeMsg('alice', 'hello world'))

      expect(robot.brain.data.history).to.have.length(1)
      expect(robot.brain.data.history[0].name).to.equal('alice')
      expect(robot.brain.data.history[0].message).to.equal('hello world')
    })

    it('stores multiple messages in order', () => {
      const hearHandler = getHandler(robot.hear, /(.*)/i)
      hearHandler(makeMsg('alice', 'first'))
      hearHandler(makeMsg('bob', 'second'))
      hearHandler(makeMsg('alice', 'third'))

      expect(robot.brain.data.history).to.have.length(3)
      expect(robot.brain.data.history[0].message).to.equal('first')
      expect(robot.brain.data.history[1].message).to.equal('second')
      expect(robot.brain.data.history[2].message).to.equal('third')
    })

    it('respects the default limit of 10 messages', () => {
      const hearHandler = getHandler(robot.hear, /(.*)/i)
      for (let i = 0; i < 15; i++) {
        hearHandler(makeMsg('user', `msg ${i}`))
      }

      expect(robot.brain.data.history).to.have.length(10)
      expect(robot.brain.data.history[0].message).to.equal('msg 5')
      expect(robot.brain.data.history[9].message).to.equal('msg 14')
    })

    it('respects HUBOT_HISTORY_LINES env var', () => {
      process.env.HUBOT_HISTORY_LINES = '3'
      robot = createRobot()
      historyPlugin(robot)

      const hearHandler = getHandler(robot.hear, /(.*)/i)
      for (let i = 0; i < 5; i++) {
        hearHandler(makeMsg('user', `msg ${i}`))
      }

      expect(robot.brain.data.history).to.have.length(3)
      expect(robot.brain.data.history[0].message).to.equal('msg 2')
    })
  })

  describe('show history', () => {
    let hearHandler, showHandler

    beforeEach(() => {
      hearHandler = getHandler(robot.hear, /(.*)/i)
      showHandler = getHandler(robot.respond, /show ((\d+) lines of )?history/i)
    })

    it('shows all history when no line count specified', () => {
      hearHandler(makeMsg('alice', 'hello'))
      hearHandler(makeMsg('bob', 'hi there'))

      const msg = { match: ['show history', undefined, undefined], send: sinon.spy() }
      showHandler(msg)

      const output = msg.send.firstCall.args[0]
      expect(output).to.include('alice: hello')
      expect(output).to.include('bob: hi there')
    })

    it('shows only requested number of lines', () => {
      hearHandler(makeMsg('alice', 'first'))
      hearHandler(makeMsg('bob', 'second'))
      hearHandler(makeMsg('charlie', 'third'))

      const msg = { match: ['show 2 lines of history', '2 lines of ', '2'], send: sinon.spy() }
      showHandler(msg)

      const output = msg.send.firstCall.args[0]
      expect(output).to.include('Showing 2 lines')
      expect(output).to.not.include('alice: first')
      expect(output).to.include('bob: second')
      expect(output).to.include('charlie: third')
    })

    it('caps lines at cache length if requested more than available', () => {
      hearHandler(makeMsg('alice', 'only one'))

      const msg = { match: ['show 50 lines of history', '50 lines of ', '50'], send: sinon.spy() }
      showHandler(msg)

      const output = msg.send.firstCall.args[0]
      expect(output).to.include('Showing 1 lines')
      expect(output).to.include('alice: only one')
    })

    it('formats entries with timestamp', () => {
      hearHandler(makeMsg('alice', 'test message'))

      const msg = { match: ['show history', undefined, undefined], send: sinon.spy() }
      showHandler(msg)

      const output = msg.send.firstCall.args[0]
      // Should match [HH:MM] alice: test message
      expect(output).to.match(/\[\d+:\d+\] alice: test message/)
    })
  })

  describe('clear history', () => {
    it('clears all stored messages', () => {
      const hearHandler = getHandler(robot.hear, /(.*)/i)
      hearHandler(makeMsg('alice', 'hello'))
      hearHandler(makeMsg('bob', 'world'))

      expect(robot.brain.data.history).to.have.length(2)

      const clearHandler = getHandler(robot.respond, /clear history/i)
      const msg = { send: sinon.spy() }
      clearHandler(msg)

      expect(msg.send).to.have.been.calledWith("Ok, I'm clearing the history.")
      expect(robot.brain.data.history).to.have.length(0)
    })
  })

  describe('brain persistence', () => {
    it('registers a brain loaded listener', () => {
      expect(robot.brain.on).to.have.been.calledWith('loaded')
    })

    it('restores history from brain on load', () => {
      const savedHistory = [
        { name: 'alice', message: 'saved msg', hours: 12, minutes: '05' }
      ]
      robot.brain.data.history = savedHistory
      robot.brain.emit('loaded')

      expect(robot.logger.info).to.have.been.calledWith('Loading saved chat history')

      // Show should include the restored message
      const showHandler = getHandler(robot.respond, /show ((\d+) lines of )?history/i)
      const msg = { match: ['show history', undefined, undefined], send: sinon.spy() }
      showHandler(msg)

      const output = msg.send.firstCall.args[0]
      expect(output).to.include('alice: saved msg')
    })

    it('does not restore if brain has no history', () => {
      robot.brain.emit('loaded')
      expect(robot.logger.info).to.not.have.been.called
    })
  })

  describe('HistoryEntry formatting', () => {
    it('zero-pads minutes less than 10', () => {
      const clock = sinon.useFakeTimers(new Date(2024, 0, 1, 9, 5, 0))
      try {
        const hearHandler = getHandler(robot.hear, /(.*)/i)
        hearHandler(makeMsg('alice', 'early morning'))

        expect(robot.brain.data.history[0].minutes).to.equal('05')
        expect(robot.brain.data.history[0].hours).to.equal(9)
      } finally {
        clock.restore()
      }
    })

    it('does not zero-pad minutes 10 or greater', () => {
      const clock = sinon.useFakeTimers(new Date(2024, 0, 1, 14, 30, 0))
      try {
        const hearHandler = getHandler(robot.hear, /(.*)/i)
        hearHandler(makeMsg('alice', 'afternoon'))

        expect(robot.brain.data.history[0].minutes).to.equal(30)
        expect(robot.brain.data.history[0].hours).to.equal(14)
      } finally {
        clock.restore()
      }
    })
  })
})
