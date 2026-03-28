import type { FastifyPluginAsync } from 'fastify';
import { processChat, getHistory, clearHistory } from './chat.service.js';

export const chatRoutes: FastifyPluginAsync = async (app) => {
  // WebSocket endpoint for real-time chat
  app.get('/ws', { websocket: true }, (socket, request) => {
    const sessionId = crypto.randomUUID();

    socket.on('message', async (rawData: Buffer) => {
      try {
        const data = JSON.parse(rawData.toString()) as {
          message: string;
          feedIds?: string[];
        };

        const response = await processChat(
          sessionId,
          data.message,
          data.feedIds || []
        );

        socket.send(
          JSON.stringify({
            type: 'response',
            content: response,
            timestamp: new Date().toISOString(),
          })
        );
      } catch {
        socket.send(
          JSON.stringify({
            type: 'error',
            content: 'Failed to process message',
          })
        );
      }
    });

    socket.on('close', () => {
      clearHistory(sessionId);
    });

    // Send welcome message
    socket.send(
      JSON.stringify({
        type: 'system',
        content:
          'HCMN AI Assistant connected. Select live feeds and ask me anything about what you see.',
        timestamp: new Date().toISOString(),
      })
    );
  });

  // REST fallback for chat
  app.post('/message', async (request) => {
    const { sessionId, message, feedIds } = request.body as {
      sessionId?: string;
      message: string;
      feedIds?: string[];
    };

    const sid = sessionId || crypto.randomUUID();
    const response = await processChat(sid, message, feedIds || []);

    return {
      sessionId: sid,
      response,
      timestamp: new Date().toISOString(),
    };
  });

  // Get chat history
  app.get('/history/:sessionId', async (request) => {
    const { sessionId } = request.params as { sessionId: string };
    return getHistory(sessionId);
  });
};
