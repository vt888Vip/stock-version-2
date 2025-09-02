import { NextRequest, NextResponse } from 'next/server';
import { createServer } from 'http';
import { initSocket } from '@/lib/socket';

// Create HTTP server for Socket.IO
const server = createServer();

// Initialize Socket.IO
const io = initSocket(server);

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({
      success: true,
      message: 'Socket.IO server is running',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Socket.IO API error:', error);
    return NextResponse.json(
      { error: 'Socket.IO server error' },
      { status: 500 }
    );
  }
}

// Start server on port 3001 for Socket.IO
if (process.env.NODE_ENV === 'development') {
  const PORT = 3001;
  server.listen(PORT, () => {
    console.log(`🚀 Socket.IO server running on port ${PORT}`);
  });
}
