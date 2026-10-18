const assert=require('node:assert/strict'),fs=require('node:fs');const share=require('./receive-share'),format=require('./capture-format');
const value=share.parse(new URLSearchParams({share_text:'이것 봐요 https://www.instagram.com/reel/abc/?igsh=test'}));assert.ok(value.url.startsWith('https://www.instagram.com/'));format.validate(share.capture(value));
assert.equal(share.parse(new URLSearchParams()),null);assert.throws(()=>share.parse(new URLSearchParams({share_url:'https://instagram.com.evil.test/a'})));assert.throws(()=>share.parse(new URLSearchParams({share_url:'javascript:alert(1)'})));
const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));assert.equal(manifest.share_target.method,'GET');assert.ok(manifest.share_target.action.startsWith(manifest.scope));for(const icon of manifest.icons)assert.ok(fs.existsSync(icon.src));
console.log('PASS: Instagram shared text and URL parsing, capture format, malicious host rejection, manifest and icons');

const yt=require("./receive-share").parse(new URLSearchParams({share_url:"https://youtu.be/jNQXAC9IVRw?t=83"}));require("node:assert/strict").equal(yt.url,"https://youtu.be/jNQXAC9IVRw?t=83");
