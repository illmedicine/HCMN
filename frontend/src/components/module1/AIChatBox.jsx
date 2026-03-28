import { useState, useRef, useEffect } from 'react';
import { sendChatMessage } from '../../services/api';
import { useWebSocket } from '../../hooks/useWebSocket';

/**
 * AI-powered chat interface for querying live feed information.
 */
export default function AIChatBox({ activeFeeds }) {
  const [input, setInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(true);
  const [sessionId] = useState(() => crypto.randomUUID());
  const messagesEndRef = useRef(null);

  // Try WebSocket connection
  const { messages: wsMessages, connected: wsConnected, send: wsSend } =
    useWebSocket('/api/chat/ws');

  // Handle incoming WebSocket messages
  useEffect(() => {
    if (wsMessages.length > 0) {
      const latest = wsMessages[wsMessages.length - 1];
      if (latest.type === 'response' || latest.type === 'system') {
        setChatMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: latest.content,
            timestamp: latest.timestamp,
          },
        ]);
        setLoading(false);
      }
    }
  }, [wsMessages]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  async function handleSend(e) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput('');
    setChatMessages((prev) => [
      ...prev,
      { role: 'user', content: userMsg, timestamp: new Date().toISOString() },
    ]);
    setLoading(true);

    const feedIds = activeFeeds.map((f) => f.id);

    // Try WebSocket first, fallback to REST
    if (wsConnected) {
      wsSend({ message: userMsg, feedIds });
    } else {
      try {
        const result = await sendChatMessage(sessionId, userMsg, feedIds);
        setChatMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: result.response,
            timestamp: result.timestamp,
          },
        ]);
      } catch {
        setChatMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: 'Failed to get response. Please try again.',
            timestamp: new Date().toISOString(),
          },
        ]);
      }
      setLoading(false);
    }
  }

  const suggestedQuestions = [
    'What am I looking at?',
    'Is there heavy traffic?',
    'What\'s the weather like?',
    'Any notable activity?',
  ];

  return (
    <div className={`ai-chatbox ${isOpen ? 'open' : 'collapsed'}`}>
      <div className="chatbox-header" onClick={() => setIsOpen(!isOpen)}>
        <span>🤖 HCMN AI Assistant</span>
        <span className={`connection-dot ${wsConnected ? 'connected' : 'disconnected'}`}>●</span>
        <button className="chatbox-toggle">{isOpen ? '▼' : '▲'}</button>
      </div>

      {isOpen && (
        <>
          <div className="chatbox-messages">
            {chatMessages.length === 0 && (
              <div className="chat-welcome">
                <p>👋 Ask me anything about your active feeds!</p>
                <div className="suggested-questions">
                  {suggestedQuestions.map((q) => (
                    <button
                      key={q}
                      className="suggestion-btn"
                      onClick={() => {
                        setInput(q);
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={`chat-message ${msg.role}`}>
                <span className="chat-avatar">
                  {msg.role === 'user' ? '👤' : '🤖'}
                </span>
                <div className="chat-content">
                  <p>{msg.content}</p>
                  <span className="chat-time">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}
            {loading && (
              <div className="chat-message assistant">
                <span className="chat-avatar">🤖</span>
                <div className="chat-content typing">
                  <span>●</span><span>●</span><span>●</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form className="chatbox-input" onSubmit={handleSend}>
            <input
              type="text"
              placeholder={
                activeFeeds.length > 0
                  ? `Ask about ${activeFeeds.length} active feed(s)...`
                  : 'Select feeds to ask about them...'
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
            />
            <button type="submit" disabled={loading || !input.trim()}>
              Send
            </button>
          </form>
        </>
      )}
    </div>
  );
}
