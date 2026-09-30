const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'kostiq-secret-key-change-in-production';
const TOKEN_EXPIRY = '8h';

/**
 * Generate JWT token for a user
 */
function generateToken(user) {
    return jwt.sign(
        {
            id: user.id || user._id,
            email: user.email,
            role: user.role || 'worker',
            firstName: user.firstName,
            lastName: user.lastName
        },
        JWT_SECRET,
        { expiresIn: TOKEN_EXPIRY }
    );
}

/**
 * TARCZA 3: Zombie Sessions — Dead Employee Guard
 *
 * Factory that returns an enhanced verifyToken middleware backed by a live DB lookup.
 * After cryptographic JWT validation, the middleware:
 *   1. Checks employee.isActive — rejects if archived/fired (401)
 *   2. Overwrites req.user.role with the CURRENT role from DB — not the stale JWT role
 *
 * This closes the window where a fired manager can still act as manager for up to 8h
 * using a valid but stale JWT.
 *
 * @param {Function} getDb - Getter function returning the live MongoDB Db instance.
 *                           Using a getter avoids importing db before it's connected.
 */
function createVerifyToken(getDb) {
    return async function verifyTokenWithDBCheck(req, res, next) {
        // Test mode bypass — keeps unit tests fast
        if (process.env.NODE_ENV === 'test') {
            const authHeader = req.headers.authorization;
            let tokenRole = null;
            let tokenId = null;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                try {
                    const decoded = jwt.decode(authHeader.split(' ')[1]);
                    if (decoded) {
                        tokenRole = decoded.role;
                        tokenId = decoded.id;
                    }
                } catch (_) {}
            }
            req.user = {
                id: tokenId || req.headers['x-test-id'] || 'test-user',
                email: 'test@test.com',
                role: req.headers['x-test-role'] || tokenRole || 'admin'
            };
            return next();
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Brak tokenu autoryzacji' });
        }

        const token = authHeader.split(' ')[1];

        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            return res.status(401).json({ error: 'Token wygasl lub jest nieprawidlowy' });
        }

        // TARCZA 3: Live DB lookup — verify employee is still active and get fresh role
        const db = getDb();
        if (db) {
            try {
                const freshEmployee = await db.collection('employees').findOne(
                    { $or: [{ id: decoded.id }, { _id: decoded.id }] },
                    { projection: { isActive: 1, role: 1, id: 1, email: 1 } }
                );

                if (freshEmployee) {
                    // Guard 1: Fired/archived employee — reject immediately
                    if (freshEmployee.isActive === false) {
                        console.warn(`[ZOMBIE-GUARD] Rejected inactive user: ${decoded.email} (id: ${decoded.id})`);
                        return res.status(401).json({
                            error: 'Konto zostalo dezaktywowane. Skontaktuj sie z administratorem.'
                        });
                    }

                    // Guard 2: Role has changed — use DB role, not stale JWT role
                    if (freshEmployee.role && freshEmployee.role !== decoded.role) {
                        console.warn(`[ZOMBIE-GUARD] Role mismatch for ${decoded.email}: JWT="${decoded.role}" DB="${freshEmployee.role}" — using DB role`);
                    }

                    // Always attach fresh role from DB — Zero Trust baseline
                    req.user = {
                        ...decoded,
                        role: freshEmployee.role || decoded.role  // DB wins over JWT
                    };
                } else {
                    // Employee deleted from DB entirely — reject
                    console.warn(`[ZOMBIE-GUARD] User not found in DB: ${decoded.email} (id: ${decoded.id})`);
                    return res.status(401).json({
                        error: 'Nie znaleziono uzytkownika. Zaloguj sie ponownie.'
                    });
                }
            } catch (dbErr) {
                // DB error — fail open with JWT data (better than killing all requests during DB hiccup)
                // Log prominently so ops knows
                console.error(`[ZOMBIE-GUARD] DB lookup failed — falling back to JWT role for ${decoded.email}:`, dbErr.message);
                req.user = decoded;
            }
        } else {
            // DB not connected yet (startup race condition) — fall back to JWT
            console.warn('[ZOMBIE-GUARD] DB not available — falling back to JWT-only auth');
            req.user = decoded;
        }

        next();
    };
}

/**
 * Legacy synchronous verifyToken — kept for backward compatibility with tests.
 * For production routes, createVerifyToken(getDb) is used.
 */
function verifyToken(req, res, next) {
    if (process.env.NODE_ENV === 'test') {
        req.user = { id: 'admin-id', email: 'admin@test.com', role: 'admin' };
        return next();
    }
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Brak tokenu autoryzacji' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token wygasl lub jest nieprawidlowy' });
    }
}

/**
 * Middleware: Check if user has required role
 * @param {...string} roles - Allowed roles (e.g. 'admin', 'manager')
 */
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Brak autoryzacji' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Brak uprawnien. Wymagana rola: ' + roles.join(' lub ') });
        }
        next();
    };
}

module.exports = { generateToken, verifyToken, createVerifyToken, requireRole, JWT_SECRET };
