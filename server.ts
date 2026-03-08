import express from 'express';
import { createServer as createViteServer } from 'vite';
import cors from 'cors';
import { ulid } from 'ulid';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// --- Mock HSM / Cryptography ---
const HSM_KEY = crypto.randomBytes(32); // 256-bit AES key for HSM simulation
const JWT_SECRET = crypto.randomBytes(64).toString('hex');

function generateCAVV(pan: string, amount: number, currency: string): string {
  // Simulated CAVV generation via HMAC-SHA-256
  const hmac = crypto.createHmac('sha256', HSM_KEY);
  hmac.update(`${pan}|${amount}|${currency}|${Date.now()}`);
  return hmac.digest('base64').substring(0, 28); // 28 chars typical for CAVV
}

function maskPAN(pan: string): string {
  if (pan.length < 10) return pan;
  return `${pan.substring(0, 6)}${'*'.repeat(pan.length - 10)}${pan.substring(pan.length - 4)}`;
}

// --- Risk Engine ---
interface RiskEvaluation {
  score: number;
  action: 'frictionless' | 'challenge' | 'reject';
  reasons: string[];
}

function evaluateRisk(pan: string, amount: number, deviceData: any, exemptions: any): RiskEvaluation {
  let score = Math.floor(Math.random() * 100); // Simulated ML score 0-99
  const reasons: string[] = [];

  // Deterministic rules
  if (amount > 10000) {
    score += 40;
    reasons.push('High transaction amount');
  }

  // Exemptions logic
  if (exemptions?.type === 'low_value' && amount <= 30) {
    score = Math.min(score, 10); // Force low risk
    reasons.push('Low value exemption applied');
  } else if (exemptions?.type === 'recurring') {
    score = Math.min(score, 15);
    reasons.push('Recurring transaction exemption applied');
  } else if (exemptions?.type === 'whitelisted') {
    score = Math.min(score, 5);
    reasons.push('Whitelisted merchant exemption applied');
  } else if (exemptions?.type === 'secure_corporate') {
    score = Math.min(score, 20);
    reasons.push('Secure corporate payment exemption applied');
  } else if (exemptions?.type === 'low_value' && amount > 30) {
    reasons.push('Low value exemption rejected: amount > 30');
  }

  // BIN-level logic (mocking specific BINs for testing)
  if (pan.startsWith('4000') || pan.startsWith('6011')) {
    score = 10; // Always frictionless
    reasons.push('Test BIN: Frictionless');
  } else if (pan.startsWith('5000')) {
    score = 80; // Always challenge
    reasons.push('Test BIN: Challenge');
  } else if (pan.startsWith('3400')) {
    score = 95; // Always reject
    reasons.push('Test BIN: Reject');
  }

  let action: 'frictionless' | 'challenge' | 'reject' = 'frictionless';
  if (score > 85) action = 'reject';
  else if (score > 30) action = 'challenge';

  return { score, action, reasons };
}

// --- APIs ---

// Middleware for Correlation ID
app.use((req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] || ulid();
  res.setHeader('x-correlation-id', correlationId);
  req.correlationId = correlationId as string;
  next();
});

// 0. 3DS Method (Device Fingerprinting)
app.post('/api/3ds2/brw/ThreeDSMethodURL', (req, res) => {
  const { threeDSMethodData } = req.body;
  console.log(`[${req.correlationId}] ThreeDSMethodURL invoked`);
  
  // In a real flow, this would render a hidden iframe to collect device data.
  // We'll just return a success response for the test harness.
  res.json({
    threeDSMethodData: threeDSMethodData, // Echo back for testing
    status: 'completed'
  });
});

// 1. Authentication Initiation (AReq)
app.post('/api/3ds2/authenticate', (req, res) => {
  const { pan, amount, currency, deviceData, exemptions } = req.body;
  const transStatusReason = '01'; // Default reason

  if (!pan || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const maskedPan = maskPAN(pan);
  console.log(`[${req.correlationId}] AReq received for PAN: ${maskedPan}, Amount: ${amount}`);

  const risk = evaluateRisk(pan, amount, deviceData, exemptions);
  console.log(`[${req.correlationId}] Risk Score: ${risk.score}, Action: ${risk.action}`);

  let transStatus = 'Y'; // Authentication Successful
  let cavv = '';
  let acsUrl = '';
  let creq = '';

  if (risk.action === 'frictionless') {
    transStatus = 'Y';
    cavv = generateCAVV(pan, amount, currency);
  } else if (risk.action === 'challenge') {
    transStatus = 'C'; // Challenge Required
    acsUrl = `${process.env.APP_URL || 'http://localhost:3000'}/api/3ds2/challenge-ui`;
    // Generate a CReq payload (base64url encoded JSON)
    const creqPayload = {
      acsTransID: ulid(),
      challengeWindowSize: '05',
      messageType: 'CReq',
      messageVersion: '2.2.0',
      threeDSServerTransID: req.correlationId
    };
    creq = Buffer.from(JSON.stringify(creqPayload)).toString('base64url');
  } else {
    transStatus = 'N'; // Not Authenticated
  }

  const ares = {
    messageType: 'ARes',
    messageVersion: '2.2.0',
    threeDSServerTransID: req.correlationId,
    acsTransID: ulid(),
    transStatus,
    transStatusReason: transStatus === 'N' ? '11' : undefined, // 11 = Suspected Fraud
    acsURL: transStatus === 'C' ? acsUrl : undefined,
    authenticationValue: cavv || undefined,
    dsReferenceNumber: 'DS-12345',
    riskScore: risk.score,
    riskReasons: risk.reasons
  };

  res.json({ ares, creq: transStatus === 'C' ? creq : undefined });
});

// 2. Challenge Orchestration (CReq) - Typically a form POST from browser
app.post('/api/3ds2/challenge', (req, res) => {
  const { creq } = req.body;
  if (!creq) return res.status(400).send('Missing CReq');

  try {
    const decodedCreq = JSON.parse(Buffer.from(creq, 'base64url').toString('utf-8'));
    console.log(`[${req.correlationId}] CReq received:`, decodedCreq);

    // In a real flow, this renders the challenge UI. We'll return a mock HTML or JSON for the test harness.
    res.json({
      message: 'Challenge UI should be rendered here.',
      acsTransID: decodedCreq.acsTransID,
      challengeType: 'OTP'
    });
  } catch (e) {
    res.status(400).send('Invalid CReq');
  }
});

// 3. Challenge Submission (Mocking user entering OTP)
app.post('/api/3ds2/challenge-submit', (req, res) => {
  const { acsTransID, otp, threeDSServerTransID } = req.body;
  
  let transStatus = 'Y';
  if (otp !== '123456') { // Mock OTP validation
    transStatus = 'N';
  }

  const cavv = transStatus === 'Y' ? generateCAVV('0000', 0, 'USD') : '';

  // Simulate RReq to 3DS Server
  const rreq = {
    messageType: 'RReq',
    messageVersion: '2.2.0',
    threeDSServerTransID,
    acsTransID,
    transStatus,
    authenticationValue: cavv
  };

  // Sign the RReq callback
  const signedRreq = jwt.sign(rreq, JWT_SECRET, { expiresIn: '5m' });

  // In a real scenario, the ACS sends RReq to the DS, which forwards to 3DSS.
  // We'll just return it to the client for the test harness to simulate the flow.
  res.json({
    message: 'Challenge completed',
    transStatus,
    cres: Buffer.from(JSON.stringify({ messageType: 'CRes', messageVersion: '2.2.0', acsTransID, transStatus })).toString('base64url'),
    signedRreq
  });
});

// 4. Result Notification (RReq)
app.post('/api/3ds2/result', (req, res) => {
  const { signedRreq } = req.body;
  
  try {
    const decoded = jwt.verify(signedRreq, JWT_SECRET);
    console.log(`[${req.correlationId}] RReq received and verified:`, decoded);
    
    res.json({
      messageType: 'RRes',
      messageVersion: '2.2.0',
      resultsStatus: '00' // Success
    });
  } catch (e) {
    console.error('Invalid RReq signature');
    res.status(400).json({ error: 'Invalid signature' });
  }
});

// --- Vite Integration ---
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
