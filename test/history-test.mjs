import chai from 'chai'
import sinon from 'sinon'
import sinonChai from 'sinon-chai'
import history from '../src/history.mjs'

chai.use(sinonChai)
const expect = chai.expect

describe('history', () => {
  let robot

  beforeEach(() => {
    robot = {
      respond: sinon.spy(),
      hear: sinon.spy(),
      brain: {
        on: sinon.spy(),
        data: {}
      },
      logger: {
        info: sinon.spy()
      }
    }
    history(robot)
  })

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
