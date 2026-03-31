// Description:
//   Allows Hubot to store a recent chat history for services like IRC that
//   won't do it for you.
//
// Dependencies:
//   None
//
// Configuration:
//   HUBOT_HISTORY_LINES
//
// Commands:
//   hubot show [<lines> lines of] history - Shows <lines> of history, otherwise all history
//   hubot clear history - Clears the history
//
// Author:
//   wubr

class History {
  constructor (robot, keep) {
    this.robot = robot
    this.keep = keep
    this.cache = []
    this.robot.brain.on('loaded', () => {
      if (this.robot.brain.data.history) {
        this.robot.logger.info('Loading saved chat history')
        this.cache = this.robot.brain.data.history
      }
    })
  }

  add (message) {
    this.cache.push(message)
    while (this.cache.length > this.keep) {
      this.cache.shift()
    }
    this.robot.brain.data.history = this.cache
  }

  show (lines) {
    if (lines > this.cache.length) {
      lines = this.cache.length
    }
    let reply = 'Showing ' + lines + ' lines of history:\n'
    for (const message of this.cache.slice(-lines)) {
      reply = reply + this.entryToString(message) + '\n'
    }
    return reply
  }

  entryToString (event) {
    return '[' + event.hours + ':' + event.minutes + '] ' + event.name + ': ' + event.message
  }

  clear () {
    this.cache = []
    this.robot.brain.data.history = this.cache
  }
}

class HistoryEntry {
  constructor (name, message) {
    this.name = name
    this.message = message
    this.time = new Date()
    this.hours = this.time.getHours()
    this.minutes = this.time.getMinutes()
    if (this.minutes < 10) {
      this.minutes = '0' + this.minutes
    }
  }
}

export default (robot) => {
  const linesToKeep = process.env.HUBOT_HISTORY_LINES || 10

  const history = new History(robot, linesToKeep)

  robot.hear(/(.*)/i, (msg) => {
    const historyentry = new HistoryEntry(msg.message.user.name, msg.match[1])
    history.add(historyentry)
  })

  robot.respond(/show ((\d+) lines of )?history/i, (msg) => {
    const lines = msg.match[2] ? msg.match[2] : history.keep
    msg.send(history.show(lines))
  })

  robot.respond(/clear history/i, (msg) => {
    msg.send("Ok, I'm clearing the history.")
    history.clear()
  })
}
