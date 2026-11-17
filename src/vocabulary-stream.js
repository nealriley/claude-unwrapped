export function createStream(sessions, random = Math.random) {
  const remaining = [...sessions]
  let session
  let sessionNumber = 0
  let messageIndex = 0
  let wordIndex = 0
  let sessionScanned = 0

  return {
    peek(limit) {
      const upcoming = []
      if (!session) return upcoming
      for (let i=messageIndex;i<session.messages.length && upcoming.length<limit;i++) {
        const ids = session.messages[i][2]
        const from = i===messageIndex ? wordIndex : 0
        upcoming.push(...ids.slice(from,from+limit-upcoming.length))
      }
      return upcoming
    },
    next(shuffle) {
      if (!session || messageIndex === session.messages.length) {
        if (!remaining.length) return null
        const at = shuffle ? Math.floor(random()*remaining.length) : 0
        session = remaining.splice(at,1)[0]
        sessionNumber++
        sessionScanned = messageIndex = wordIndex = 0
      }
      const [timestamp,assistant,ids] = session.messages[messageIndex]
      const id = ids[wordIndex++]
      if (wordIndex === ids.length) {
        messageIndex++
        wordIndex = 0
      }
      return {id,timestamp,assistant,session,sessionNumber,sessionScanned:++sessionScanned}
    },
  }
}
