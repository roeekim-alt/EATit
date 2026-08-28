import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const partsDir = resolve('src/app-parts')
const files = (await readdir(partsDir)).filter(f => f.endsWith('.txt')).sort()
const chunks = await Promise.all(files.map(f => readFile(resolve(partsDir, f), 'utf8')))
await writeFile(resolve('src/App.jsx'), chunks.join(''), 'utf8')
console.log(`Assembled src/App.jsx from ${files.length} parts`)
