import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const testFiles = [
  'performance-integrated.js',
  'performance-numbered-lists.js',
  'performance-description-lists.js',
  'performance-mixed-content.js'
]

const runTest = (testFile) => {
  return new Promise((resolve, reject) => {
    //console.log(`\n${'='.repeat(60)}`)
    //console.log(`?? Running: ${testFile}`)
    //console.log(`${'='.repeat(60)}`)
    
    const testPath = join(__dirname, testFile)
    const child = spawn('node', [testPath], {
      stdio: 'inherit',
      cwd: process.cwd()
    })
    
    child.on('close', (code) => {
      if (code === 0) {
        //console.log(`? ${testFile} completed successfully`)
        resolve()
      } else {
        //console.log(`? ${testFile} failed with code ${code}`)
        reject(new Error(`Test failed: ${testFile}`))
      }
    })
    
    child.on('error', (err) => {
      //console.log(`? Failed to start ${testFile}:`, err.message)
      reject(err)
    })
  })
}

const runAllTests = async () => {
  //console.log('?? Performance Test Suite for markdown-it-numbering-ul-regarded-as-ol')
  //console.log(`?? Started at: ${new Date().toLocaleString()}`)
  
  const startTime = Date.now()
  
  try {
    for (const testFile of testFiles) {
      await runTest(testFile)
    }
    
    const endTime = Date.now()
    const totalDuration = endTime - startTime
    
    //console.log(`\n${'='.repeat(60)}`)
    //console.log('?? All Performance Tests Completed!')
    //console.log(`?? Total execution time: ${totalDuration}ms (${(totalDuration/1000).toFixed(2)}s)`)
    //console.log(`?? Finished at: ${new Date().toLocaleString()}`)
    //console.log(`${'='.repeat(60)}`)
    
  } catch (error) {
    console.error('? Performance test suite failed:', error.message)
    process.exit(1)
  }
}

// Allow running individual tests
if (process.argv.length > 2) {
  const requestedTest = process.argv[2]
  const testFile = testFiles.find(file => file.includes(requestedTest))
  
  if (testFile) {
    //console.log(`?? Running individual test: ${testFile}`)
    runTest(testFile).catch(error => {
      console.error('? Test failed:', error.message)
      process.exit(1)
    })
  } else {
    //console.log('? Test not found. Available tests:')
    testFiles.forEach((file, index) => {
      const shortName = file.replace('performance-', '').replace('.js', '')
      //console.log(`   ${index + 1}. ${shortName} (run with: node performance-runner.js ${shortName})`)
    })
    process.exit(1)
  }
} else {
  // Run all tests
  runAllTests()
}
