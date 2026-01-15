import React, { useState, useEffect, useRef } from 'react';
import { Settings, Send, Twitter, Bot, AlertTriangle, CheckCircle, XCircle, Terminal, Key, Loader2, Edit3, ExternalLink, Plus, Trash2, Play, Square, Clock } from 'lucide-react';

/**
 * ------------------------------------------------------------------
 * OAUTH 1.0a HELPER FUNCTIONS (REQUIRED FOR TWITTER API)
 * ------------------------------------------------------------------
 * Pure frontend implementation using native Web Crypto API.
 */
const OAuth = {
  percentEncode: (str) => {
    return encodeURIComponent(str)
      .replace(/!/g, '%21')
      .replace(/\*/g, '%2A')
      .replace(/'/g, '%27')
      .replace(/\(/g, '%28')
      .replace(/\)/g, '%29');
  },

  getNonce: () => {
    return Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
  },

  getTimestamp: () => {
    return Math.floor(Date.now() / 1000).toString();
  },

  generateSignature: async (method, url, params, consumerSecret, tokenSecret) => {
    const sortedKeys = Object.keys(params).sort();
    let paramString = '';
    
    sortedKeys.forEach((key, index) => {
      paramString += `${key}=${OAuth.percentEncode(params[key])}`;
      if (index < sortedKeys.length - 1) paramString += '&';
    });

    const signatureBase = `${method.toUpperCase()}&${OAuth.percentEncode(url)}&${OAuth.percentEncode(paramString)}`;
    const signingKey = `${OAuth.percentEncode(consumerSecret)}&${OAuth.percentEncode(tokenSecret)}`;
    
    const encoder = new TextEncoder();
    const keyData = encoder.encode(signingKey);
    const data = encoder.encode(signatureBase);

    const cryptoKey = await window.crypto.subtle.importKey(
      "raw", 
      keyData, 
      { name: "HMAC", hash: "SHA-1" }, 
      false, 
      ["sign"]
    );

    const signatureBuffer = await window.crypto.subtle.sign(
      "HMAC", 
      cryptoKey, 
      data
    );

    return btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
  }
};

/**
 * ------------------------------------------------------------------
 * MAIN APPLICATION COMPONENT
 * ------------------------------------------------------------------
 */
export default function TweetAutomator() {
  // -- Configuration State --
  const [config, setConfig] = useState({
    geminiKey: process.env.REACT_APP_GEMINI_KEY || '',
    twitterConsumerKey: process.env.REACT_APP_TWITTER_CONSUMER_KEY || '',
    twitterConsumerSecret: process.env.REACT_APP_TWITTER_CONSUMER_SECRET || '',
    twitterAccessToken: process.env.REACT_APP_TWITTER_ACCESS_TOKEN || '',
    twitterTokenSecret: process.env.REACT_APP_TWITTER_TOKEN_SECRET || '',
    corsProxy: process.env.REACT_APP_CORS_PROXY || 'https://cors-anywhere.herokuapp.com/'
  });

  // -- App Logic State --
  const [topics, setTopics] = useState([]);
  const [newTopic, setNewTopic] = useState('');
  const [logs, setLogs] = useState([]);
  const [status, setStatus] = useState('idle'); 
  const [showSettings, setShowSettings] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');
  const [useProxy, setUseProxy] = useState(false);
  
  // -- Automation State --
  const [isAutomated, setIsAutomated] = useState(false);
  const [nextRunTime, setNextRunTime] = useState(null);
  const timerRef = useRef(null);
  const countdownRef = useRef(null);
  const [timeRemaining, setTimeRemaining] = useState('');

  // -- Constants --
  const INTERVAL_MS = 40 * 60 * 1000; // 40 Minutes

  // -- Load/Save Config & Topics --
  useEffect(() => {
    const savedConfig = localStorage.getItem('tweet_automator_config');
    const savedTopics = localStorage.getItem('tweet_automator_topics');
    
    if (savedConfig) setConfig(JSON.parse(savedConfig));
    if (savedTopics) setTopics(JSON.parse(savedTopics));
    
    addLog('System', 'Ready. Add topics and start automation.');
    
    return () => stopAutomation(); // Cleanup on unmount
  }, []);

  const saveConfig = (newConfig) => {
    setConfig(newConfig);
    localStorage.setItem('tweet_automator_config', JSON.stringify(newConfig));
    setShowSettings(false);
    addLog('System', 'Configuration saved.');
  };

  const saveTopics = (newTopics) => {
    setTopics(newTopics);
    localStorage.setItem('tweet_automator_topics', JSON.stringify(newTopics));
  };

  const addTopic = () => {
    if (!newTopic.trim()) return;
    if (topics.length >= 10) {
      addLog('System', 'Maximum 10 topics allowed.', 'warning');
      return;
    }
    const updated = [...topics, newTopic.trim()];
    saveTopics(updated);
    setNewTopic('');
  };

  const removeTopic = (index) => {
    const updated = topics.filter((_, i) => i !== index);
    saveTopics(updated);
  };

  const addLog = (source, message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [`[${timestamp}] [${source}] ${message}`, ...prev]);
  };

  // -- Core Logic: Generate & Post --
  const processCycle = async (selectedTopic) => {
    setStatus('generating');
    
    // 1. Generate Text
    const text = await generateText(selectedTopic);
    if (!text) {
      setStatus('error');
      return;
    }

    // 2. Post to Twitter (with small delay)
    setTimeout(async () => {
      await postToTwitter(text);
      // If automated, set status back to idle-waiting
      if (isAutomated) setStatus('waiting');
      else setStatus('success');
    }, 2000);
  };

  const generateText = async (topic) => {
    if (!config.geminiKey) {
      addLog('Error', 'Missing Gemini API Key.', 'error');
      return null;
    }

    addLog('Gemini', `Topic: "${topic}". Generating timely content...`);

    try {
      const now = new Date().toLocaleString();
      const prompt = `
        Current Date/Time: ${now}.
        You are a professional Software Engineer specializing in AI. 
        Write a single, and engaging tweet about the topic: "${topic}".
        - Make it relevant to general recent trends if applicable.
        - Under 280 characters.
        - No hashtags unless absolutely necessary for the topic context.
        - No quotes around the tweet.
        - Do not start with "Here is a tweet". Just output the tweet text.
      `;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${config.geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        }
      );

      if (!response.ok) throw new Error(`Gemini API Error: ${response.statusText}`);

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      
      if (!text) throw new Error('No text returned from Gemini.');

      addLog('Gemini', `Generated: "${text}"`);
      setGeneratedContent(text);
      return text;
    } catch (error) {
      addLog('Gemini', `Error: ${error.message}`, 'error');
      return null;
    }
  };

  const postToTwitter = async (tweetText) => {
    if (!config.twitterConsumerKey || !config.twitterAccessToken) {
      addLog('Error', 'Missing Twitter credentials. Opening Web Intent.', 'error');
      openWebIntent(tweetText);
      return;
    }

    addLog('Twitter', 'Signing and posting tweet...');
    setStatus('posting');

    const method = 'POST';
    const baseUrl = 'https://api.twitter.com/2/tweets';
    const targetUrl = useProxy ? `${config.corsProxy}${baseUrl}` : baseUrl;

    const oauthParams = {
      oauth_consumer_key: config.twitterConsumerKey,
      oauth_token: config.twitterAccessToken,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: OAuth.getTimestamp(),
      oauth_nonce: OAuth.getNonce(),
      oauth_version: '1.0'
    };

    try {
      const signature = await OAuth.generateSignature(
        method,
        baseUrl,
        oauthParams,
        config.twitterConsumerSecret,
        config.twitterTokenSecret
      );

      const authHeader = `OAuth oauth_consumer_key="${oauthParams.oauth_consumer_key}",oauth_token="${oauthParams.oauth_token}",oauth_signature_method="HMAC-SHA1",oauth_timestamp="${oauthParams.oauth_timestamp}",oauth_nonce="${oauthParams.oauth_nonce}",oauth_version="1.0",oauth_signature="${OAuth.percentEncode(signature)}"`;

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'x-requested-with': 'XMLHttpRequest' 
        },
        body: JSON.stringify({ text: tweetText })
      });

      if (!response.ok) {
        if (response.status === 0 || response.status === 403 || response.status === 401) {
             throw new Error("CORS/Auth Error. Check proxy/keys.");
        }
        throw new Error(`Twitter API Error: ${response.status}`);
      }

      const data = await response.json();
      addLog('Twitter', `Success! Tweet ID: ${data.data.id}`);
    } catch (error) {
      addLog('Twitter', `Failed: ${error.message}`, 'error');
      if (!isAutomated) openWebIntent(tweetText); // Only fallback to manual if not automated
    }
  };

  const openWebIntent = (text) => {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // -- Automation Loop --
  const startAutomation = () => {
    if (topics.length === 0) {
      addLog('System', 'Add at least one topic first.', 'warning');
      return;
    }

    setIsAutomated(true);
    addLog('System', 'Autopilot STARTED. Loop interval: 40 minutes.');
    
    // Run immediately
    runAutomationCycle();

    // Set interval
    timerRef.current = setInterval(() => {
      runAutomationCycle();
    }, INTERVAL_MS);
  };

  const stopAutomation = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    setIsAutomated(false);
    setNextRunTime(null);
    setTimeRemaining('');
    setStatus('idle');
    addLog('System', 'Autopilot STOPPED.');
  };

  const runAutomationCycle = () => {
    // 1. Pick Random Topic
    const randomIndex = Math.floor(Math.random() * topics.length);
    const selectedTopic = topics[randomIndex];
    
    addLog('Autopilot', `Cycle starting. Selected topic: ${selectedTopic}`);
    
    // 2. Execute
    processCycle(selectedTopic);

    // 3. Set Next Run Time for UI
    const nextRun = new Date(Date.now() + INTERVAL_MS);
    setNextRunTime(nextRun);
    
    // 4. Start Countdown UI
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      const diff = nextRun - Date.now();
      if (diff <= 0) {
        setTimeRemaining('Running...');
      } else {
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        setTimeRemaining(`${minutes}m ${seconds}s`);
      }
    }, 1000);
  };

  const handleManualRun = () => {
    if (topics.length === 0) return;
    const randomIndex = Math.floor(Math.random() * topics.length);
    processCycle(topics[randomIndex]);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-cyan-500/30">
      
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-cyan-500 to-blue-600 p-2 rounded-lg">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500">
              TweetAutomator
            </h1>
            <p className="text-xs text-slate-500">Autopilot Edition</p>
          </div>
        </div>
        <button 
          onClick={() => setShowSettings(true)}
          className="p-2 hover:bg-slate-800 rounded-full transition-colors relative group"
        >
          <Settings className="w-5 h-5 text-slate-400 group-hover:text-cyan-400" />
        </button>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Left Column: Topic Manager & Controls */}
        <div className="space-y-6">
          
          {/* Controls Panel */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg shadow-black/20">
             <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-slate-400 uppercase flex items-center gap-2">
                  <Clock className="w-4 h-4" /> 
                  Automation Control
                </h2>
                {isAutomated && (
                  <span className="text-xs font-mono text-cyan-400 animate-pulse bg-cyan-950/50 px-2 py-1 rounded">
                    Next Run: {timeRemaining}
                  </span>
                )}
             </div>

             <div className="grid grid-cols-2 gap-3">
               {!isAutomated ? (
                 <button 
                  onClick={startAutomation}
                  disabled={topics.length === 0}
                  className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-lg font-bold transition-all hover:shadow-lg hover:shadow-green-500/20"
                 >
                   <Play className="w-4 h-4 fill-current" />
                   Start Autopilot
                 </button>
               ) : (
                 <button 
                  onClick={stopAutomation}
                  className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white py-3 rounded-lg font-bold transition-all hover:shadow-lg hover:shadow-red-500/20"
                 >
                   <Square className="w-4 h-4 fill-current" />
                   Stop Autopilot
                 </button>
               )}

               <button
                 onClick={handleManualRun}
                 disabled={isAutomated || topics.length === 0}
                 className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 py-3 rounded-lg font-medium transition-all border border-slate-700"
               >
                 <Send className="w-4 h-4" />
                 Run Once
               </button>
             </div>
             
             <div className="mt-4 flex items-center gap-2">
                <input 
                  type="checkbox" 
                  id="proxyToggle"
                  checked={useProxy}
                  onChange={(e) => setUseProxy(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-800 text-cyan-500 focus:ring-0"
                />
                <label htmlFor="proxyToggle" className="text-xs text-slate-500 cursor-pointer select-none">
                  Use Proxy (Required for Autopilot)
                </label>
             </div>
          </div>

          {/* Topic List */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg shadow-black/20">
            <div className="flex items-center justify-between mb-4">
               <label className="flex items-center gap-2 text-sm font-medium text-slate-400">
                 <Edit3 className="w-4 h-4" />
                 Topic List ({topics.length}/10)
               </label>
            </div>
            
            <div className="flex gap-2 mb-4">
              <input 
                type="text" 
                value={newTopic}
                onChange={(e) => setNewTopic(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTopic()}
                placeholder="Add topic (e.g. AI, Crypto)..."
                disabled={isAutomated}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 disabled:opacity-50"
              />
              <button 
                onClick={addTopic}
                disabled={isAutomated || topics.length >= 10}
                className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-500 text-white p-2 rounded-lg transition-colors"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {topics.length === 0 && (
                <p className="text-center text-slate-600 text-xs py-4 italic">No topics added yet.</p>
              )}
              {topics.map((topic, idx) => (
                <div key={idx} className="flex items-center justify-between bg-slate-950 border border-slate-800/50 p-3 rounded-lg group hover:border-slate-700 transition-colors">
                  <span className="text-sm text-slate-300 font-medium truncate">{topic}</span>
                  {!isAutomated && (
                    <button 
                      onClick={() => removeTopic(idx)}
                      className="text-slate-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right Column: Console/Logs & Preview */}
        <div className="space-y-6">
          
          {/* Latest Tweet Preview */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 relative overflow-hidden min-h-[140px]">
            <div className={`absolute top-0 left-0 w-1 h-full ${status === 'posting' ? 'bg-yellow-500 animate-pulse' : 'bg-blue-500'}`} />
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-slate-400 flex items-center gap-2">
                <Twitter className="w-4 h-4 text-blue-400" />
                Latest Generated Tweet
              </h3>
              {status === 'generating' && <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />}
            </div>
            
            {generatedContent ? (
              <p className="text-lg text-white font-medium leading-relaxed">
                {generatedContent}
              </p>
            ) : (
              <p className="text-sm text-slate-600 italic mt-4">
                Waiting for next cycle...
              </p>
            )}
          </div>

          {/* Console */}
          <div className="flex flex-col h-[400px] bg-black border border-slate-800 rounded-xl overflow-hidden font-mono text-xs shadow-2xl">
            <div className="bg-slate-900 p-2 border-b border-slate-800 flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-400">
                <Terminal className="w-3 h-3" />
                System Logs
              </span>
              <div className="flex items-center gap-2">
                {status === 'waiting' && <span className="text-yellow-500 flex items-center gap-1"><Clock className="w-3 h-3"/> Waiting</span>}
                {status === 'success' && <span className="text-green-500 flex items-center gap-1"><CheckCircle className="w-3 h-3"/> Sent</span>}
              </div>
            </div>
            <div className="flex-1 p-4 overflow-y-auto space-y-2">
              {logs.length === 0 && (
                <div className="text-slate-700 text-center mt-20">System ready.</div>
              )}
              {logs.map((log, i) => (
                <div key={i} className="border-l-2 border-slate-800 pl-2 py-1">
                  <span className={`${
                    log.includes('[Error]') ? 'text-red-400' : 
                    log.includes('[Twitter]') ? 'text-blue-400' :
                    log.includes('[Gemini]') ? 'text-purple-400' : 
                    log.includes('[Autopilot]') ? 'text-green-400' : 'text-slate-500'
                  }`}>
                    {log}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </main>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Key className="w-5 h-5 text-cyan-400" />
                API Configuration
              </h2>
              <button onClick={() => setShowSettings(false)} className="text-slate-500 hover:text-white">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              
              <div className="bg-yellow-900/20 border border-yellow-700/50 p-3 rounded-lg flex gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0" />
                <p className="text-xs text-yellow-200/80 leading-relaxed">
                  <strong>Warning:</strong> Automated posting requires a stable internet connection. Keep this tab open.
                </p>
              </div>

              {/* Gemini Section */}
              <div className="space-y-2">
                <label className="text-xs uppercase font-bold text-slate-500">Gemini API Key</label>
                <input 
                  type="password" 
                  value={config.geminiKey}
                  onChange={(e) => setConfig({...config, geminiKey: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white focus:border-cyan-500 outline-none"
                />
              </div>

              {/* Twitter Section */}
              <div className="space-y-3 pt-4 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs uppercase font-bold text-slate-500">Twitter API Credentials</label>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                   <div className="space-y-1">
                      <span className="text-[10px] text-slate-500">API Key (Consumer)</span>
                      <input 
                        type="password" 
                        value={config.twitterConsumerKey}
                        onChange={(e) => setConfig({...config, twitterConsumerKey: e.target.value})}
                        className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm"
                      />
                   </div>
                   <div className="space-y-1">
                      <span className="text-[10px] text-slate-500">API Secret</span>
                      <input 
                        type="password" 
                        value={config.twitterConsumerSecret}
                        onChange={(e) => setConfig({...config, twitterConsumerSecret: e.target.value})}
                        className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm"
                      />
                   </div>
                   <div className="space-y-1">
                      <span className="text-[10px] text-slate-500">Access Token</span>
                      <input 
                        type="password" 
                        value={config.twitterAccessToken}
                        onChange={(e) => setConfig({...config, twitterAccessToken: e.target.value})}
                        className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm"
                      />
                   </div>
                   <div className="space-y-1">
                      <span className="text-[10px] text-slate-500">Token Secret</span>
                      <input 
                        type="password" 
                        value={config.twitterTokenSecret}
                        onChange={(e) => setConfig({...config, twitterTokenSecret: e.target.value})}
                        className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm"
                      />
                   </div>
                </div>
              </div>

              {/* Proxy Section */}
              <div className="space-y-2 pt-4 border-t border-slate-800">
                <label className="text-xs uppercase font-bold text-slate-500">CORS Proxy URL</label>
                <input 
                  type="text" 
                  value={config.corsProxy}
                  onChange={(e) => setConfig({...config, corsProxy: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-slate-400 focus:border-cyan-500 outline-none"
                />
              </div>

            </div>

            <div className="p-6 border-t border-slate-800 flex justify-end">
              <button 
                onClick={() => saveConfig(config)}
                className="bg-cyan-600 hover:bg-cyan-500 text-white px-6 py-2 rounded-lg font-medium transition-colors"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}