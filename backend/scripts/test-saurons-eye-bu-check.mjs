/**
 * Test Sauron's Eye - Check BU Dropdown in Frontend
 * 
 * Uses Sauron's Eye to observe the live UI and verify BU list
 */

import fetch from 'node-fetch';

const DAEMON_URL = 'http://localhost:7000';
const FRONTEND_URL = 'http://localhost:5174';

async function callTool(toolName, args) {
  const response = await fetch(`${DAEMON_URL}/tools/${toolName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  });
  
  if (!response.ok) {
    throw new Error(`Tool call failed: ${response.status} ${response.statusText}`);
  }
  
  return await response.json();
}

async function checkBUDropdown() {
  console.log('🔍 Using Sauron\'s Eye to check BU dropdown...\n');
  
  try {
    // Step 1: Check Sauron's Eye status
    console.log('1️⃣ Checking Sauron\'s Eye status...');
    const status = await callTool('saurons_eye_status', {});
    
    if (!status.success) {
      console.error('❌ Sauron\'s Eye not available:', status.error);
      console.log('\n💡 Make sure:');
      console.log('   - Daemon is running (http://localhost:7000)');
      console.log('   - Sauron\'s Eye extension is installed');
      console.log('   - You\'ve clicked a tab to attach');
      return;
    }
    
    console.log(`✅ Status: ${status.data.status}`);
    console.log(`   Tab attached: ${status.data.tabAttached}`);
    console.log(`   Extension connected: ${status.data.extensionConnected}\n`);
    
    if (!status.data.tabAttached) {
      console.log('⚠️  No tab attached. Opening frontend...');
      
      // Navigate to frontend
      const navResult = await callTool('saurons_eye_navigate', {
        url: FRONTEND_URL,
        wait_until: 'networkidle'
      });
      
      if (!navResult.success) {
        console.error('❌ Failed to navigate:', navResult.error);
        return;
      }
      
      console.log('✅ Navigated to frontend\n');
      
      // Wait for page to load
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Step 2: Observe the page
    console.log('2️⃣ Observing page structure...');
    const observe = await callTool('saurons_eye_observe', {
      depth: 'standard',
      include_metadata: true
    });
    
    if (!observe.success) {
      console.error('❌ Failed to observe:', observe.error);
      return;
    }
    
    console.log(`✅ Page title: ${observe.data.title}`);
    console.log(`   URL: ${observe.data.url}\n`);
    
    // Step 3: Extract BU dropdown content
    console.log('3️⃣ Extracting BU dropdown...');
    const extract = await callTool('saurons_eye_extract', {
      query: 'button:has-text("BU"), [data-testid*="bu"]',
      format: 'text',
      depth: 'standard'
    });
    
    if (extract.success && extract.data.results) {
      console.log('✅ Found BU elements:');
      extract.data.results.forEach((result, i) => {
        console.log(`   ${i + 1}. ${result.text || result.value}`);
      });
    }
    
    // Step 4: Check for hardcoded BU values in DOM
    console.log('\n4️⃣ Checking for hardcoded BU values...');
    const dom = await callTool('saurons_eye_dom', {
      selector: 'body',
      depth: 'summary',
      include_text: true
    });
    
    if (dom.success) {
      const bodyText = JSON.stringify(dom.data);
      
      // Check for old hardcoded BUs
      const oldBUs = ['BU 1', 'BU 57', 'BU 65', 'BU 30', 'BU 92', 'BU 10'];
      const foundOldBUs = oldBUs.filter(bu => bodyText.includes(bu));
      
      if (foundOldBUs.length > 0) {
        console.log('⚠️  Found old hardcoded BUs in DOM:');
        foundOldBUs.forEach(bu => console.log(`   - ${bu}`));
      } else {
        console.log('✅ No old hardcoded BUs found');
      }
      
      // Check for AVAILABLE_BUS constant
      if (bodyText.includes('AVAILABLE_BUS')) {
        console.log('⚠️  Found AVAILABLE_BUS constant reference in DOM');
      }
    }
    
    // Step 5: Check source code
    console.log('\n5️⃣ Checking App.tsx source code...');
    const fs = await import('fs');
    const appTsx = fs.readFileSync('c:/musa/dev/Attrinute-Center/visionmerch-ai-product-enrichment/App.tsx', 'utf-8');
    
    if (appTsx.includes('AVAILABLE_BUS')) {
      console.log('⚠️  AVAILABLE_BUS constant found in App.tsx');
      
      // Extract the constant
      const match = appTsx.match(/const AVAILABLE_BUS = \[([\s\S]*?)\];/);
      if (match) {
        console.log('\n📋 Current AVAILABLE_BUS definition:');
        console.log(match[0]);
      }
    } else {
      console.log('✅ No AVAILABLE_BUS hardcoded constant');
    }
    
    console.log('\n✅ Sauron\'s Eye inspection complete!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

// Run
checkBUDropdown();

