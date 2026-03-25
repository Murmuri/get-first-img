const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const https = require('https');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function readJSON(filePath) {
  try {
    const data = await fs.promises.readFile(filePath, 'utf8');

    return JSON.parse(data);
  } catch (error) {
    console.error('JSON error:', error.message);

    return null;
  }
}

async function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
      if (url.startsWith('data:image')) {
        const base64Data = url.split(',')[1];

        fs.writeFile(filepath, base64Data, 'base64', (err) => {
            if (err) reject(err);
            else resolve(true);
        });

        return;
      }
      
      const protocol = url.startsWith('https') 
        ? https 
        : require('http');
      
      const request = protocol.get(url, (response) => {
        if (response.statusCode === 200) {
          const fileStream = fs.createWriteStream(filepath);

          response.pipe(fileStream);
          fileStream.on('finish', () => {
              fileStream.close();
              resolve(true);
          });
        } else if (response.statusCode === 301 || response.statusCode === 302) {
          downloadImage(response.headers.location, filepath).then(resolve).catch(reject);
        } else {
          reject(new Error(`Failed to download: ${response.statusCode}`));
        }
      });
      
      request.on('error', reject);
      request.setTimeout(10000, () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
  });
}

async function searchFirstImageDuckDuckGo(query, id, outputDir = 'images') {
  let browser = null;
    
  try {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
      
    const filename = `${id}.jpg`;
    const filepath = path.join(outputDir, filename);
      
    if (fs.existsSync(filepath)) {
      console.log(`[${id}] File is exist, next...`);

      return true;
    }
      
    console.log(`[${id}] DuckDuckGo: ${query}`);
    
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1920, height: 1080 });
    
    const searchQuery = encodeURIComponent(query);
    await page.goto(`https://duckduckgo.com/?q=${searchQuery}&iax=images&ia=images`, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    await delay(3000);
    
    try {
      const acceptButton = await page.$('button[data-testid="accept-button"]');
      if (acceptButton) {
        await acceptButton.click();
        await delay(1000);
      }
    } catch (err) {
      console.log(`button is not exist`);
    }
    
    await page.evaluate(() => {
        window.scrollBy(0, 500);
    });
    
    await delay(2000);
      
    const imageUrl = await page.evaluate(() => {
      const selectors = [
        '.tile--img__img',
        '.tile img',
        'img[data-src]',
        'img[src*="https"]'
      ];
      
      for (const selector of selectors) {
        const img = document.querySelector(selector);

        if (img) {
          const src = img.src || img.getAttribute('data-src');

          if (src && src.startsWith('http')) {
            return src;
          }
        }
      }

      return null;
    });
      
    if (!imageUrl) {
      console.log(`[${id}] not fount`);
      await browser.close();

      return false;
    }
    
    await downloadImage(imageUrl, filepath);
    console.log(`[${id}] Saved photo`);
    
    await browser.close();
    return true;
      
  } catch (error) {
    console.error(`[${id}] Error: ${error.message}`);

    if (browser) {
      await browser.close();
    }
    return false;
  }
}

async function main() {
  try {
    const jsonPath = process.argv[2] || 'data.json';
    const searchSring = process.argv[3] || '';
    
    const data = await readJSON(jsonPath);
    
    if (!data) {
      console.error('JSON error');
      return;
    }
    
    let items = Array.isArray(data) ? data : [data];
    
    console.log(`Founded ${items.length} elements\n`);
    
    let successCount = 0;
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const name = searchSring + ' ' + item.name;
      const id = item.id;
      
      if (!name || !id) {
        console.log(`Next: element ${i} not have name or id`);
        continue;
      }
      
      let result = await searchFirstImageDuckDuckGo(name, id);
      
      if (result) {
        successCount++;
      }
      
      if (i < items.length - 1) {
        console.log(`Waiting...`);
        await delay(3000);
      }
    }
    
    console.log(`Done! ${successCount} / ${items.length}`);
  } catch (error) {
      console.error('error:', error.message);
  }
}

main();