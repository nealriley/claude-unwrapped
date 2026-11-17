const wordsPattern = /[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’\-][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*/gu

export function wordData(sessions) {
  const chronological = [...sessions].sort((a,b)=>Date.parse(a.turns[0][1])-Date.parse(b.turns[0][1]))
  const vocabulary = []
  const dictionary = new Map()
  let tokens = 0
  const playback = []
  for (const session of chronological) {
    const messages = []
    let count = 0
    for (const [assistant,date,text] of session.turns) {
      const ids = []
      for (const match of text.normalize('NFKC').toLowerCase().matchAll(wordsPattern)) {
        const word = match[0].replaceAll('’',"'")
        if (!dictionary.has(word)) {
          dictionary.set(word,vocabulary.length)
          vocabulary.push(word)
        }
        ids.push(dictionary.get(word))
      }
      if (ids.length) {
        messages.push([Date.parse(date),Number(assistant),ids])
        count += ids.length
      }
    }
    if (messages.length) {
      playback.push({title:session.title,kind:session.kind,messages,count})
      tokens += count
    }
  }
  return {vocabulary,sessions:playback,tokens}
}
