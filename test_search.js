import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function for assertion testing
function assert(condition, message) {
  if (!condition) {
    throw new Error(`❌ Assertion Failed: ${message}`);
  }
  console.log(`✅ Passed: ${message}`);
}

async function runTests() {
  console.log('🧪 Starting Card Search Validation Tests...\n');

  // Load database
  const cardsPath = path.join(__dirname, 'src', 'data', 'cards.json');
  assert(fs.existsSync(cardsPath), 'cards.json database file should exist');
  
  const cards = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));
  assert(cards.length === 16, `Database should contain exactly 16 cards (found ${cards.length})`);

  // Test 1: Search by exact name (case-insensitive)
  const jinxMatches = cards.filter(c => c.name.toLowerCase().includes('jinx'));
  assert(jinxMatches.length === 1, 'Searching for "jinx" should yield exactly 1 card');
  assert(jinxMatches[0].id === 'OGN-070', 'Jinx card ID should be OGN-070');
  assert(jinxMatches[0].domain === 'Chaos', 'Jinx should belong to Chaos domain');

  // Test 2: Search by part of name
  const drakeMatches = cards.filter(c => c.name.toLowerCase().includes('drake'));
  assert(drakeMatches.length === 1, 'Searching for "drake" should yield Mountain Drake');
  assert(drakeMatches[0].id === 'OGN-110', 'Mountain Drake ID should be OGN-110');

  // Test 3: Search by ability text
  const accelerateMatches = cards.filter(c => c.ability.toLowerCase().includes('accelerate'));
  assert(accelerateMatches.length >= 2, 'At least 2 cards should contain "accelerate" in their ability text');
  console.log(`  (Found ${accelerateMatches.length} accelerate cards: ${accelerateMatches.map(c => c.name).join(', ')})`);

  // Test 4: Filter by domain
  const furyCards = cards.filter(c => c.domain === 'Fury');
  assert(furyCards.length === 6, 'There should be exactly 6 Fury cards');

  const calmCards = cards.filter(c => c.domain === 'Calm');
  assert(calmCards.length === 2, 'There should be exactly 2 Calm cards');

  // Test 5: Verify might and cost attributes
  const jinx = jinxMatches[0];
  assert(jinx.energyCost === 5, 'Jinx energyCost should be 5');
  assert(jinx.powerCost === 1, 'Jinx powerCost should be 1');
  assert(jinx.might === 4, 'Jinx might should be 4');

  const spellCard = cards.find(c => c.type === 'Spell');
  assert(spellCard, 'Should have at least one spell card');
  assert(spellCard.might === null, 'Spells should have null might');

  console.log('\n🎉 All 5 validation tests completed successfully!');
}

runTests().catch(err => {
  console.error('\n🔴 Test Suite Failed:', err.message);
  process.exit(1);
});
