import React, { useState } from 'react';
import { CreditCard, ShieldCheck, ShieldAlert, Activity, Key, Server, CheckCircle, XCircle, List } from 'lucide-react';

const SYNTHETIC_CARDS = [
  { scheme: 'Visa', pan: '4000000000000002', type: 'Frictionless', desc: 'Always succeeds without challenge' },
  { scheme: 'Mastercard', pan: '5000000000000005', type: 'Challenge', desc: 'Always triggers OTP challenge' },
  { scheme: 'Amex', pan: '340000000000009', type: 'Reject', desc: 'High risk, always rejected' },
  { scheme: 'Discover', pan: '6011000000000000', type: 'Frictionless', desc: 'Standard Discover test card' },
];

export default function Dashboard() {
  const [pan, setPan] = useState(SYNTHETIC_CARDS[0].pan);
  const [amount, setAmount] = useState('150.00');
  const [currency, setCurrency] = useState('USD');
  const [exemption, setExemption] = useState('none');
  const [logs, setLogs] = useState<any[]>([]);
  const [challengeData, setChallengeData] = useState<any>(null);
  const [otp, setOtp] = useState('');

  const addLog = (type: string, data: any) => {
    setLogs(prev => [{ id: Date.now(), type, data, time: new Date().toISOString() }, ...prev]);
  };

  const initiate3DSMethod = async () => {
    try {
      addLog('INFO', 'Initiating 3DS Method (Device Fingerprinting)');
      const res = await fetch('/api/3ds2/brw/ThreeDSMethodURL', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threeDSMethodData: btoa(JSON.stringify({ threeDSServerTransID: Date.now().toString() })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') })
      });
      const data = await res.json();
      addLog('INFO', `3DS Method Completed: ${data.status}`);
    } catch (err) {
      addLog('ERROR', err);
    }
  };

  const initiateAuth = async () => {
    try {
      addLog('INFO', 'Initiating 3DS Authentication (AReq)');
      const res = await fetch('/api/3ds2/authenticate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          pan, 
          amount: parseFloat(amount), 
          currency, 
          deviceData: { browser: 'Chrome' },
          exemptions: exemption !== 'none' ? { type: exemption } : undefined
        })
      });
      const data = await res.json();
      addLog('ARES', data.ares);

      if (data.ares.transStatus === 'C') {
        setChallengeData({
          creq: data.creq,
          acsURL: data.ares.acsURL,
          acsTransID: data.ares.acsTransID,
          threeDSServerTransID: data.ares.threeDSServerTransID
        });
      } else {
        setChallengeData(null);
      }
    } catch (err) {
      addLog('ERROR', err);
    }
  };

  const submitChallenge = async () => {
    if (!challengeData) return;
    try {
      addLog('INFO', 'Submitting Challenge (OTP)');
      const res = await fetch('/api/3ds2/challenge-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acsTransID: challengeData.acsTransID,
          threeDSServerTransID: challengeData.threeDSServerTransID,
          otp
        })
      });
      const data = await res.json();
      addLog('CRES', data);
      setChallengeData(null);
      setOtp('');

      // Simulate RReq
      addLog('INFO', 'Simulating RReq to 3DS Server');
      const rreqRes = await fetch('/api/3ds2/result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedRreq: data.signedRreq })
      });
      const rreqData = await rreqRes.json();
      addLog('RRES', rreqData);

    } catch (err) {
      addLog('ERROR', err);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300 font-sans p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between border-b border-zinc-800 pb-6 gap-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-emerald-500" />
            <div>
              <h1 className="text-2xl font-semibold text-zinc-100">Synthetic 3DS 2.0 Platform</h1>
              <p className="text-sm text-zinc-500">EMVCo-compliant testing harness</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm bg-zinc-900 px-4 py-2 rounded-lg border border-zinc-800">
            <span className="flex items-center gap-2"><Server className="w-4 h-4 text-emerald-500" /> API: Online</span>
            <span className="w-px h-4 bg-zinc-800"></span>
            <span className="flex items-center gap-2"><Key className="w-4 h-4 text-emerald-500" /> HSM: Simulated</span>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Controls */}
          <div className="space-y-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h2 className="text-lg font-medium text-zinc-100 mb-4 flex items-center gap-2">
                <List className="w-5 h-5" /> Synthetic Test Cards
              </h2>
              <div className="space-y-2">
                {SYNTHETIC_CARDS.map((card, idx) => (
                  <button
                    key={idx}
                    onClick={() => setPan(card.pan)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      pan === card.pan 
                        ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' 
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-medium text-sm text-zinc-200">{card.scheme}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold ${
                        card.type === 'Frictionless' ? 'bg-emerald-500/20 text-emerald-400' :
                        card.type === 'Challenge' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>{card.type}</span>
                    </div>
                    <div className="font-mono text-xs mb-1">{card.pan}</div>
                    <div className="text-[10px] text-zinc-500">{card.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h2 className="text-lg font-medium text-zinc-100 mb-4 flex items-center gap-2">
                <CreditCard className="w-5 h-5" /> Transaction Details
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1 uppercase tracking-wider">Card Number (PAN)</label>
                  <input
                    type="text"
                    value={pan}
                    onChange={e => setPan(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-100 focus:outline-none focus:border-emerald-500 font-mono text-sm"
                  />
                  <p className="text-xs text-zinc-500 mt-1">4000... = Frictionless, 5000... = Challenge</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1 uppercase tracking-wider">Amount</label>
                    <input
                      type="number"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-100 focus:outline-none focus:border-emerald-500 font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1 uppercase tracking-wider">Currency</label>
                    <input
                      type="text"
                      value={currency}
                      onChange={e => setCurrency(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-100 focus:outline-none focus:border-emerald-500 font-mono text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1 uppercase tracking-wider">PSD2 Exemption</label>
                  <select
                    value={exemption}
                    onChange={e => setExemption(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-100 focus:outline-none focus:border-emerald-500 text-sm"
                  >
                    <option value="none">None</option>
                    <option value="low_value">Low Value (≤ €30)</option>
                    <option value="recurring">Recurring Transaction</option>
                    <option value="whitelisted">Whitelisted Merchant</option>
                    <option value="secure_corporate">Secure Corporate Payment</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={initiate3DSMethod}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
                  >
                    <Server className="w-4 h-4" /> 3DS Method
                  </button>
                  <button
                    onClick={initiateAuth}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
                  >
                    <Activity className="w-4 h-4" /> Authenticate
                  </button>
                </div>
              </div>
            </div>

            {challengeData && (
              <div className="bg-zinc-900 border border-amber-500/30 rounded-xl p-6 shadow-[0_0_15px_rgba(245,158,11,0.1)]">
                <h2 className="text-lg font-medium text-amber-500 mb-4 flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5" /> ACS Challenge
                </h2>
                <div className="space-y-4">
                  <p className="text-sm text-zinc-400">Enter OTP to complete challenge (Use '123456' for success).</p>
                  <div>
                    <input
                      type="text"
                      value={otp}
                      onChange={e => setOtp(e.target.value)}
                      placeholder="Enter OTP"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-100 focus:outline-none focus:border-amber-500 font-mono text-sm text-center tracking-[0.5em]"
                    />
                  </div>
                  <button
                    onClick={submitChallenge}
                    className="w-full bg-amber-600 hover:bg-amber-500 text-white font-medium py-2.5 rounded-lg transition-colors"
                  >
                    Submit Challenge
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Logs */}
          <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl flex flex-col h-[800px]">
            <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
              <h2 className="text-sm font-medium text-zinc-100 uppercase tracking-wider">Transaction Logs</h2>
              <button onClick={() => setLogs([])} className="text-xs text-zinc-500 hover:text-zinc-300">Clear</button>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-4 font-mono text-xs">
              {logs.map(log => (
                <div key={log.id} className="border border-zinc-800 rounded bg-zinc-950 p-3">
                  <div className="flex items-center justify-between mb-2 text-zinc-500">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      log.type === 'ERROR' ? 'bg-red-500/20 text-red-400' :
                      log.type === 'INFO' ? 'bg-blue-500/20 text-blue-400' :
                      log.type === 'ARES' ? 'bg-emerald-500/20 text-emerald-400' :
                      log.type === 'CRES' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-purple-500/20 text-purple-400'
                    }`}>
                      {log.type}
                    </span>
                    <span>{new Date(log.time).toLocaleTimeString()}</span>
                  </div>
                  <pre className="text-zinc-300 overflow-x-auto whitespace-pre-wrap break-all">
                    {typeof log.data === 'object' ? JSON.stringify(log.data, null, 2) : log.data}
                  </pre>
                </div>
              ))}
              {logs.length === 0 && (
                <div className="h-full flex items-center justify-center text-zinc-600">
                  No logs yet. Initiate an authentication to begin.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
