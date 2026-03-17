import http from 'http';

async function testProxy() {
  const imageName = '51341408.jpg';
  const url = `http://localhost:3002/api/images/${imageName}`;
  
  console.log(`Testing Proxy for ${url}...`);
  
  http.get(url, (res) => {
    console.log('Status Code:', res.statusCode);
    console.log('Headers:', res.headers);
    
    let dataLen = 0;
    res.on('data', (chunk) => {
      dataLen += chunk.length;
    });
    
    res.on('end', () => {
      console.log(`Successfully received ${dataLen} bytes.`);
      if (res.statusCode === 200 && dataLen > 0) {
        console.log('✅ Proxy is working!');
      } else {
        console.log('❌ Proxy failed or returned no data.');
      }
    });
  }).on('error', (e) => {
    console.error('Request Error:', e.message);
  });
}

testProxy();

