/**
 * Sauron's Eye - Inspect UI for Issues
 * 
 * Use Sauron's Eye daemon tools to observe the live UI
 */

import fetch from 'node-fetch';

const DAEMON_URL = 'http://localhost:7000';
const FRONTEND_URL = 'http://localhost:5174';

async function callTool(toolName, args) {
  try {
    const response = await fetch(`${DAEMON_URL}/tools/${toolName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    });
    
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Tool call failed: ${response.status} ${response.statusText}\n${text}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`❌ Failed to call ${toolName}:`, error.message);
    throw error;
  }
}

async function inspectUI() {
  console.log('👁️  Sauron\'s Eye - UI Inspection\n');
  
  try {
    // Step 1: Check status
    console.log('1️⃣ Checking Sauron\'s Eye status...');
    const status = await callTool('saurons_eye_status', {});
    
    if (!status.success) {
      console.error('❌ Sauron\'s Eye not available');
      console.log('\n💡 To enable Sauron\'s Eye:');
      console.log('   1. Make sure daemon is running (http://localhost:7000)');
      console.log('   2. Install Sauron\'s Eye browser extension');
      console.log('   3. Click extension icon and select a tab');
      return;
    }
    
    console.log(`✅ Status: ${status.data.status}`);
    console.log(`   Tab attached: ${status.data.tabAttached}`);
    console.log(`   Extension connected: ${status.data.extensionConnected}\n`);
    
    // Step 2: Navigate if needed
    if (!status.data.tabAttached) {
      console.log('2️⃣ Navigating to frontend...');
      const nav = await callTool('saurons_eye_navigate', {
        url: FRONTEND_URL,
        wait_until: 'networkidle'
      });
      
      if (!nav.success) {
        console.error('❌ Failed to navigate');
        return;
      }
      
      console.log('✅ Navigation complete\n');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Step 3: Observe page
    console.log('3️⃣ Observing page structure...');
    const observe = await callTool('saurons_eye_observe', {
      depth: 'standard',
      include_metadata: true
    });
    
    if (!observe.success) {
      console.error('❌ Failed to observe page');
      return;
    }
    
    console.log(`✅ Page: ${observe.data.title}`);
    console.log(`   URL: ${observe.data.url}`);
    console.log(`   Viewport: ${observe.data.viewport?.width}x${observe.data.viewport?.height}\n`);
    
    // Step 4: Take screenshot
    console.log('4️⃣ Capturing screenshot...');
    const screenshot = await callTool('saurons_eye_screenshot', {
      format: 'png',
      quality: 80,
      full_page: false
    });
    
    if (screenshot.success && screenshot.data.artifact_ref) {
      console.log(`✅ Screenshot saved: ${screenshot.data.artifact_ref.path}`);
      console.log(`   Size: ${Math.round(screenshot.data.artifact_ref.size_bytes / 1024)}KB\n`);
    }
    
    // Step 5: Check for React errors in console
    console.log('5️⃣ Checking browser console for errors...');
    const consoleCheck = await callTool('saurons_eye_observe', {
      depth: 'standard',
      include_metadata: true
    });
    
    if (consoleCheck.success && consoleCheck.data.console_errors) {
      const errors = consoleCheck.data.console_errors;
      if (errors.length > 0) {
        console.log(`⚠️  Found ${errors.length} console errors:`);
        errors.forEach((err, i) => {
          console.log(`   ${i + 1}. ${err.message || err.text}`);
        });
      } else {
        console.log('✅ No console errors');
      }
    }
    
    // Step 6: Extract specific UI elements
    console.log('\n6️⃣ Extracting UI elements...');
    
    // Check BU dropdown
    const buDropdown = await callTool('saurons_eye_extract', {
      query: 'button:has-text("BU")',
      format: 'text',
      depth: 'summary'
    });
    
    if (buDropdown.success && buDropdown.data.results) {
      console.log(`✅ BU Dropdown: ${buDropdown.data.results.length} element(s)`);
      buDropdown.data.results.forEach((el, i) => {
        console.log(`   ${i + 1}. Text: "${el.text}"`);
      });
    }
    
    // Check navigation tabs
    const tabs = await callTool('saurons_eye_extract', {
      query: 'button[class*="flex items-center"], nav button',
      format: 'text',
      depth: 'summary'
    });
    
    if (tabs.success && tabs.data.results) {
      console.log(`\n✅ Navigation Tabs: ${tabs.data.results.length} tab(s)`);
      tabs.data.results.slice(0, 10).forEach((tab, i) => {
        console.log(`   ${i + 1}. "${tab.text}"`);
      });
    }
    
    // Step 7: Check DOM structure
    console.log('\n7️⃣ Checking DOM structure...');
    const dom = await callTool('saurons_eye_dom', {
      selector: 'body',
      depth: 'summary',
      include_text: false
    });
    
    if (dom.success) {
      console.log('✅ DOM structure retrieved');
      console.log(`   Body children: ${dom.data.children?.length || 0}`);
    }
    
    console.log('\n✅ Inspection complete!');
    console.log('\n📝 Summary:');
    console.log('   - Check screenshot for visual issues');
    console.log('   - Review console errors above');
    console.log('   - Verify BU dropdown and tabs are rendering correctly');
    
  } catch (error) {
    console.error('\n❌ Inspection failed:', error.message);
    console.error(error.stack);
  }
}

// Run
inspectUI().then(() => {
  console.log('\n✨ Done');
  process.exit(0);
}).catch((err) => {
  console.error('\n💥 Failed:', err.message);
  process.exit(1);
});

