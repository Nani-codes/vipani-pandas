import os
import ast
import logging
import pandas as pd
from io import StringIO
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
import clickhouse_connect
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI as OpenAIClient
import pandasai as pai
from pandasai_openai import OpenAI
import json
import asyncio
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime

load_dotenv()

CLICKHOUSE_HOST = os.getenv("CLICKHOUSE_HOST")
CLICKHOUSE_USER = os.getenv("CLICKHOUSE_USER")
CLICKHOUSE_PASSWORD = os.getenv("CLICKHOUSE_PASSWORD")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

app = FastAPI(title="PandasAI Data Chat API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000","http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class QueryRequest(BaseModel):
    businessId: str
    user_query: str

async def generate_results(businessId, user_query):
    try:
        client = clickhouse_connect.get_client(
            host=CLICKHOUSE_HOST,
            user=CLICKHOUSE_USER,
            password=CLICKHOUSE_PASSWORD,
            secure=True
        )

        columns_result = client.query("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'masterLogging'
            ORDER BY ordinal_position
        """).result_set
        column_names = [row[0] for row in columns_result]

        query = f"SELECT * FROM masterLogging WHERE businessId='{businessId}'"
        data_result = client.query(query).result_set
        if not data_result:
            logger.error(f"No data found for businessId: {businessId}")
            yield "data: " + json.dumps({"error": "No data found for given businessId."}) + "\n\n"
            return

        df = pd.DataFrame(data_result, columns=column_names)

        columns_to_remove = [
            'id', 'batchId', 'bookId', 'businessId', 'counterId', 'customerId',
            'employeeId', 'hsnCode', 'itemGroupId', 'itemId', 'locationId', 'posId',
            'posTxnNo', 'refTxId', 'refTxnNo', 'sessionBaseTxnNo', 'sessionId', 'sku',
            'taxId', 'supplierId', 'taxType'
        ]
        df.drop(columns=[col for col in columns_to_remove if col in df.columns], inplace=True)

        buffer = StringIO()
        df.info(buf=buffer)
        info_str = buffer.getvalue()

        openai_client = OpenAIClient(api_key=OPENAI_API_KEY)

        instruction_prompt = (
            f"This is the dataframe info: {info_str}.\n beware of the null values in the columns. "
            f"You are a pandasai chatting expert. Your aim is to create a plan based on the user query. "
            f"Don't write code. Output in a Python list format of instructions (including visualizations), "
            f"that will be passed in the pandasai chat one by one."
        )

        try:
            response = openai_client.responses.create(
                # model="o4-mini",
                model="gpt-4.1",
                instructions=instruction_prompt,
                input=user_query,
            )
            instructions = ast.literal_eval(response.output_text)
        except Exception as e:
            logger.error(f"Error in OpenAI response: {str(e)}")
            yield "data: " + json.dumps({"error": "Error generating instructions from OpenAI."}) + "\n\n"
            return

        llm = OpenAI(api_token=OPENAI_API_KEY)
        pai.config.set({"llm": llm})
        pdf = pai.DataFrame(df)

        loop_df = pdf

        # Send initial information
        yield "data: " + json.dumps({
            "type": "init",
            "total_steps": len(instructions)
        }) + "\n\n"
        
        for i, step in enumerate(instructions):
            try:
                # Indicate step is starting
                yield "data: " + json.dumps({
                    "type": "step_start",
                    "step_index": i,
                    "instruction": step
                }) + "\n\n"
                
                await asyncio.sleep(0.1)  # Small delay
                
                # Execute the step
                output = loop_df.chat(step)
                
                # Send the step result
                result = {
                    "type": "step_complete",
                    "step_index": i,
                    "instruction": step,
                    "response": output.to_json() if hasattr(output, "to_json") else str(output)
                }
                
                yield "data: " + json.dumps(result) + "\n\n"
                
                # Update the dataframe for the next step if this step returned a dataframe
                if hasattr(output, "type") and output.type == "dataframe":
                    loop_df = pai.DataFrame(output.value)
                
                await asyncio.sleep(0.1)  # Small delay to ensure frontend can process
                
            except Exception as e:
                logger.error(f"Error processing step: {step}. Error: {str(e)}")
                yield "data: " + json.dumps({
                    "type": "step_error",
                    "step_index": i,
                    "instruction": step,
                    "error": str(e)
                }) + "\n\n"
                await asyncio.sleep(0.1)

        # Signal completion
        yield "data: " + json.dumps({"type": "complete"}) + "\n\n"

    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        yield "data: " + json.dumps({"error": f"An unexpected error occurred: {str(e)}"}) + "\n\n"

@app.post("/analyze")
async def analyze_data(request: QueryRequest):
    return StreamingResponse(
        generate_results(request.businessId, request.user_query),
        media_type="text/event-stream"
    )



# Add these to your existing API file
class ConversationCreate(BaseModel):
    id: str
    userId: str
    businessId: str
    title: str
    messages: List[Dict[str, Any]]

class ConversationUpdate(BaseModel):
    messages: List[Dict[str, Any]]

@app.post("/conversations")
async def create_conversation(conversation: ConversationCreate):
    try:
        client = clickhouse_connect.get_client(
            host=CLICKHOUSE_HOST,
            user=CLICKHOUSE_USER,
            password=CLICKHOUSE_PASSWORD,
            secure=True
        )
        
        # Convert messages to JSON string
        messages_json = json.dumps(conversation.messages)
        
        # Check if conversation already exists
        check_query = "SELECT id FROM conversations WHERE id = %(id)s"
        check_result = client.query(check_query, parameters={'id': conversation.id}).result_set
        
        if check_result:
            # If conversation exists, update it
            update_query = """
                ALTER TABLE conversations
                UPDATE messages = %(messages)s, title = %(title)s, updatedAt = now()
                WHERE id = %(id)s
            """
            client.command(update_query, parameters={
                'messages': messages_json,
                'title': conversation.title,
                'id': conversation.id
            })
        else:
            # If conversation doesn't exist, create it
            insert_query = """
                INSERT INTO conversations (id, userId, businessId, title, messages, createdAt, updatedAt)
                VALUES (%(id)s, %(userId)s, %(businessId)s, %(title)s, %(messages)s, now(), now())
            """
            client.command(insert_query, parameters={
                'id': conversation.id,
                'userId': conversation.userId,
                'businessId': conversation.businessId,
                'title': conversation.title,
                'messages': messages_json
            })
        
        return {"status": "success", "id": conversation.id}
    
    except Exception as e:
        logger.error(f"Error creating conversation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create conversation: {str(e)}")

@app.put("/conversations/{conversationId}")
async def update_conversation(conversationId: str, conversation_update: ConversationUpdate):
    try:
        client = clickhouse_connect.get_client(
            host=CLICKHOUSE_HOST,
            user=CLICKHOUSE_USER,
            password=CLICKHOUSE_PASSWORD,
            secure=True
        )
        
        # Convert messages to JSON string
        messages_json = json.dumps(conversation_update.messages)
        
        # Update conversation
        update_query = """
            ALTER TABLE conversations
            UPDATE messages = %(messages)s, updatedAt = now()
            WHERE id = %(id)s
        """
        client.command(update_query, parameters={
            'messages': messages_json,
            'id': conversationId
        })
        
        return {"status": "success", "id": conversationId}
    
    except Exception as e:
        logger.error(f"Error updating conversation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update conversation: {str(e)}")




@app.get("/conversations/{userId}")
async def get_conversations(userId: str):
    try:
        client = clickhouse_connect.get_client(
            host=CLICKHOUSE_HOST,
            user=CLICKHOUSE_USER,
            password=CLICKHOUSE_PASSWORD,
            secure=True
        )
        
        # Get conversations for user
        result = client.query(f"""
            SELECT id, userId, businessId, title, createdAt, updatedAt
            FROM conversations
            WHERE userId = '{userId}'
            ORDER BY updatedAt DESC
        """)
        
        conversations = []
        for row in result.result_set:
            conversations.append({
                "id": row[0],
                "userId": row[1],
                "businessId": row[2],
                "title": row[3],
                "createdAt": row[4].isoformat() if row[4] else None,
                "updatedAt": row[5].isoformat() if row[5] else None
            })
        
        return conversations
    
    except Exception as e:
        logger.error(f"Error getting conversations: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get conversations: {str(e)}")

@app.get("/conversations/{userId}/{conversationId}")
async def get_conversation(userId: str, conversationId: str):
    try:
        client = clickhouse_connect.get_client(
            host=CLICKHOUSE_HOST,
            user=CLICKHOUSE_USER,
            password=CLICKHOUSE_PASSWORD,
            secure=True
        )
        
        # Get conversation by ID
        result = client.query(f"""
            SELECT id, userId, businessId, title, messages, createdAt, updatedAt
            FROM conversations
            WHERE id = '{conversationId}' AND userId = '{userId}'
        """)
        
        if not result.result_set:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        row = result.result_set[0]
        return {
            "id": row[0],
            "userId": row[1],
            "businessId": row[2],
            "title": row[3],
            "messages": json.loads(row[4]),
            "createdAt": row[5].isoformat() if row[5] else None,
            "updatedAt": row[6].isoformat() if row[6] else None
        }
    
    except Exception as e:
        logger.error(f"Error getting conversation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get conversation: {str(e)}")


@app.delete("/conversations/{conversationId}")
async def delete_conversation(conversationId: str):
    try:
        client = clickhouse_connect.get_client(
            host=CLICKHOUSE_HOST,
            user=CLICKHOUSE_USER,
            password=CLICKHOUSE_PASSWORD,
            secure=True
        )
        
        # Delete conversation
        client.command(f"""
            DELETE FROM conversations
            WHERE id = '{conversationId}'
        """)
        
        return {"status": "success"}
    
    except Exception as e:
        logger.error(f"Error deleting conversation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete conversation: {str(e)}")