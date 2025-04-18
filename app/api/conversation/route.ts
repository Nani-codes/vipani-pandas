import { NextResponse } from "next/server";
import fs from 'fs';
import path from 'path';

// Fallback to file-based storage when ClickHouse fails
const DATA_DIR = path.join(process.cwd(), 'data');

// Ensure data directory exists
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (err) {
  console.error('Failed to create data directory:', err);
}

export async function POST(req: Request) {
  try {
    const { userId, conversationId, conversation } = await req.json();

    if (!userId || !conversationId || !conversation?.length) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    console.log(`Saving conversation: ID=${conversationId}, User=${userId}, Messages=${conversation.length}`);

    try {
      const filePath = path.join(DATA_DIR, `conversation_${conversationId}.json`);
      
      // Save to file
      fs.writeFileSync(filePath, JSON.stringify({
        id: conversationId,
        user_id: userId,
        messages: conversation.map((msg: any) => msg.content),
        message_types: conversation.map((msg: any) => msg.type),
        steps: conversation.map((msg: any) => JSON.stringify(msg.steps || [])),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        raw_conversation: conversation // Save full conversation object for easy restoration
      }, null, 2));

      console.log(`Conversation saved successfully to file: ${filePath}`);
      return NextResponse.json({ success: true, conversationId }, { status: 201 });
    } catch (fsError: any) {
      console.error("File system operation failed:", fsError);
      return NextResponse.json({ 
        error: "File system operation failed", 
        details: fsError.message 
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error("Error processing conversation request:", error);
    return NextResponse.json({ 
      error: "Internal Server Error", 
      details: error.message 
    }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (!id) return NextResponse.json({ error: "Missing ID parameter" }, { status: 400 });

  try {
    console.log(`Fetching conversation: ${id}`);
    const filePath = path.join(DATA_DIR, `conversation_${id}.json`);
    
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    console.log(`Conversation fetched successfully from file: ${filePath}`);
    
    return NextResponse.json({ conversation: data }, { status: 200 });
  } catch (error: any) {
    console.error("Error fetching conversation:", error);
    return NextResponse.json({ 
      error: "Error fetching conversation", 
      details: error.message 
    }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (!id) return NextResponse.json({ error: "Missing ID parameter" }, { status: 400 });

  try {
    console.log(`Deleting conversation: ${id}`);
    const filePath = path.join(DATA_DIR, `conversation_${id}.json`);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Conversation deleted successfully: ${id}`);
      return NextResponse.json({ 
        success: true, 
        message: "Conversation deleted successfully" 
      }, { status: 200 });
    } else {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
  } catch (error: any) {
    console.error("Error deleting conversation:", error);
    return NextResponse.json({ 
      error: "Error deleting conversation", 
      details: error.message 
    }, { status: 500 });
  }
}