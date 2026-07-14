const { MongoClient } = require('mongodb');
const { generateToken } = require('./authMiddleware');
const http = require('http');

const c = new MongoClient('mongodb://127.0.0.1:27017/costframe');
c.connect().then(async () => {
    const db = c.db();
    const admin = await db.collection('employees').findOne({ firstName: 'Administrator' });
    const storedPwd = admin.pwaPassword || admin.password || '';
    console.log('Admin email:', admin.email);
    console.log('Admin password (plain):', storedPwd);
    console.log('Admin role:', admin.role);

    // Test login
    const loginBody = JSON.stringify({ email: admin.email, password: storedPwd });
    await new Promise((resolve) => {
        const req = http.request({
            hostname: 'localhost', port: 3000, path: '/api/auth/login',
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(loginBody) }
        }, (res) => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                const parsed = JSON.parse(data);
                console.log('\nLogin result:', res.statusCode);
                if (parsed.token) {
                    console.log('✅ Login OK! Token starts with:', parsed.token.substring(0, 40) + '...');
                    console.log('User:', JSON.stringify(parsed.user));
                } else {
                    console.log('❌ Error:', parsed.error);
                }
                resolve(null);
            });
        });
        req.on('error', e => { console.log('Error:', e.message); resolve(null); });
        req.write(loginBody);
        req.end();
    });

    await c.close();
}).catch(e => console.error(e.message));
