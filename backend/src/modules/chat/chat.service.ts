import type { ChatMessage, CameraFeed } from '../../types/index.js';
import { config } from '../../config.js';
import { getFeedById, getAllFeeds } from '../feeds/feed.service.js';

const conversationHistory: Map<string, ChatMessage[]> = new Map();

/**
 * Process a user chat message about active feeds.
 * Enriches the prompt with feed context and calls the AI provider.
 */
export async function processChat(
  sessionId: string,
  userMessage: string,
  activeFeedIds: string[]
): Promise<string> {
  // Build context from active feeds
  const activeFeeds = activeFeedIds
    .map((id) => getFeedById(id))
    .filter((f): f is CameraFeed => f !== undefined);

  const feedContext = activeFeeds
    .map(
      (f, i) =>
        `Feed ${i + 1}: "${f.name}" - ${f.description}. Location: ${f.location.label || `${f.location.latitude}, ${f.location.longitude}`}. City: ${f.city || 'Unknown'}. Source: ${f.source}. Tags: ${f.tags?.join(', ') || 'none'}.`
    )
    .join('\n');

  const systemPrompt = `You are an AI assistant for the HCMN (Human Centralized Mesh Network) surveillance platform. 
You help users understand what they're seeing in live camera feeds.
The user is currently viewing the following live feeds:

${feedContext || 'No feeds currently selected.'}

Provide helpful, concise, real-time contextual information about what might be happening in these feeds.
Include relevant data about traffic conditions, weather, local events, or any notable activity.
If asked about a specific feed, reference it by its name and location.`;

  // Get or create conversation history
  if (!conversationHistory.has(sessionId)) {
    conversationHistory.set(sessionId, []);
  }
  const history = conversationHistory.get(sessionId)!;

  // Add user message
  history.push({
    role: 'user',
    content: userMessage,
    feedIds: activeFeedIds,
    timestamp: new Date().toISOString(),
  });

  // Generate AI response
  let response: string;

  if (config.openaiApiKey) {
    response = await callOpenAI(systemPrompt, history);
  } else if (config.anthropicApiKey) {
    response = await callAnthropic(systemPrompt, history);
  } else {
    response = generateLocalResponse(userMessage, activeFeeds);
  }

  // Store response
  history.push({
    role: 'assistant',
    content: response,
    timestamp: new Date().toISOString(),
  });

  // Keep history manageable (last 20 messages)
  if (history.length > 20) {
    history.splice(0, history.length - 20);
  }

  return response;
}

async function callOpenAI(systemPrompt: string, history: ChatMessage[]): Promise<string> {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openaiApiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 500,
      temperature: 0.7,
    }),
  });

  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices?.[0]?.message?.content || 'Unable to generate response.';
}

async function callAnthropic(systemPrompt: string, history: ChatMessage[]): Promise<string> {
  const messages = history
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }));

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      system: systemPrompt,
      messages,
      max_tokens: 500,
    }),
  });

  const data = (await res.json()) as { content: Array<{ text: string }> };
  return data.content?.[0]?.text || 'Unable to generate response.';
}

/**
 * Local fallback response when no AI API key is configured.
 */
function generateLocalResponse(message: string, feeds: CameraFeed[]): string {
  const lowerMsg = message.toLowerCase();

  if (feeds.length === 0) {
    return 'No feeds are currently selected. Please select up to 4 live feeds from the Feed Browser to get real-time information about them.';
  }

  if (lowerMsg.includes('traffic') || lowerMsg.includes('busy') || lowerMsg.includes('congestion')) {
    const trafficFeeds = feeds.filter(
      (f) => f.tags?.includes('traffic') || f.source === 'dot_traffic'
    );
    if (trafficFeeds.length > 0) {
      return `Based on the active feeds, I can see traffic cameras from: ${trafficFeeds.map((f) => f.name).join(', ')}. These are located at ${trafficFeeds.map((f) => f.location.label).join(' and ')}. For real-time traffic conditions, observe the feed directly for vehicle density and flow patterns. Connect an AI vision API key for automated traffic analysis.`;
    }
    return 'None of the currently viewed feeds are traffic cameras. Try selecting a DOT traffic feed for traffic information.';
  }

  if (lowerMsg.includes('weather') || lowerMsg.includes('rain') || lowerMsg.includes('sunny')) {
    return `The feeds you're viewing are from: ${feeds.map((f) => `${f.name} (${f.city || f.location.label})`).join(', ')}. For current weather conditions at these locations, you can observe sky conditions directly in the feed. Connect a weather API for precise temperature, humidity, and forecast data.`;
  }

  if (lowerMsg.includes('what') && (lowerMsg.includes('see') || lowerMsg.includes('happening'))) {
    return `You're currently viewing ${feeds.length} live feed(s):\n${feeds.map((f, i) => `${i + 1}. **${f.name}** — ${f.description} (${f.city || f.location.label})`).join('\n')}\n\nWatch the feeds for real-time activity. For AI-powered scene analysis, configure an OpenAI or Anthropic API key.`;
  }

  return `I'm monitoring ${feeds.length} feed(s): ${feeds.map((f) => f.name).join(', ')}. Ask me about traffic conditions, weather, what's happening in a specific feed, or any other questions about the locations you're viewing. Note: Connect an AI API key (OpenAI or Anthropic) for enhanced contextual responses.`;
}

export function clearHistory(sessionId: string): void {
  conversationHistory.delete(sessionId);
}

export function getHistory(sessionId: string): ChatMessage[] {
  return conversationHistory.get(sessionId) || [];
}
