import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3002/api';

async function verifyRobustness() {
  console.log('🧪 TDD: Verifying Environment Switch Robustness...');
  console.log('Target: OCI (known to have a non-existent/broken DB Link)');

  try {
    const res = await fetch(`${API_BASE}/settings/switch-environment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ env_id: 'OCI', username: 'TDD_ROBUSTNESS' })
    });

    const data = await res.json();
    console.log('Response Status:', res.status);
    console.log('Response Body:', JSON.stringify(data, null, 2));

    // EXPECTATION: res.status should be 500 and success should be false
    if (res.status === 200 && data.success === true) {
      console.error('❌ FAILURE: Switch reported success for a broken environment! (False Positive)');
      process.exit(1);
    } else {
      console.log('✅ SUCCESS: Switch correctly failed for broken environment.');
      console.log('Error Message received:', data.error?.message);
      
      if (data.error?.message && data.error.message.includes('[VERIFICATION_FAILED]')) {
        console.log('✅ SUCCESS: Error message is specific and actionable.');
      } else {
        console.warn('⚠️ WARNING: Error message could be more specific.');
      }
    }
  } catch (err) {
    console.error('❌ TEST ERROR:', err.message);
    process.exit(1);
  }
}

verifyRobustness();


