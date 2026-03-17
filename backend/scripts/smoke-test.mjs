import axios from 'axios';

async function testHealth() {
  try {
    const res = await axios.get('http://localhost:3002/api/health');
    console.log('Health Check Response:', JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error('Health Check Failed:', err.message);
  }
}

testHealth();
