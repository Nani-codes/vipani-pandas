// Modified page.tsx with userId and chatId handling

'use client';
import React, { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight, MessageSquare, Library, Loader2 } from "lucide-react";
import { Header } from "./header";
import { Preview } from "./preview";
import { renderStep,renderMessage } from "./render";
import { useSearchParams } from 'next/navigation';

const AtlasAI = () => {
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversation, setConversation] = useState([]);
  const [showChat, setShowChat] = useState(false);
  const [currentStreamingMessage, setCurrentStreamingMessage] = useState(null);
  const chatEndRef = useRef(null);
  const eventSourceRef = useRef(null);
  
  // Get URL parameters
  const searchParams = useSearchParams();
  const userId = searchParams.get('userId') || '';
  const chatId = window.location.pathname.split('/').pop() || '';
  
  // Log the extracted parameters
  console.log("Chat ID:", chatId);
  console.log("User ID:", userId);
  console.log("Conversation state:", conversation);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [conversation, currentStreamingMessage]);

  // Clean up any active EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Function to load past conversation for this chat (optional)
  const loadPastConversation = async () => {
    try {
      const response = await fetch(`http://localhost:8000/conversations/${chatId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.conversations && data.conversations.length > 0) {
          // Convert the stored conversations to the format expected by the UI
          const formattedConversations = [];
          
          for (const conv of data.conversations) {
            // Add user message
            formattedConversations.push({
              type: "user",
              content: conv.query,
              steps: []
            });
            
            // Add AI response 
            let aiResponse;
            try {
              // Try to parse the response if it's a JSON string
              if (typeof conv.response === 'string' && conv.response.startsWith('{')) {
                aiResponse = JSON.parse(conv.response);
              } else {
                aiResponse = {
                  type: "ai",
                  content: conv.query,
                  steps: conv.steps
                };
              }
            } catch (e) {
              // If parsing fails, use a default structure
              aiResponse = {
                type: "ai",
                content: conv.query,
                steps: conv.steps
              };
            }
            
            formattedConversations.push(aiResponse);
          }
          
          setConversation(formattedConversations);
          setShowChat(true);
        }
      }
    } catch (error) {
      console.error("Error loading past conversation:", error);
    }
  };
  
  // Load past conversations when component mounts
  useEffect(() => {
    if (chatId) {
      loadPastConversation();
    }
  }, [chatId]);

  const handleSubmit = async (e: { preventDefault: () => void; }) => {
    e.preventDefault();
    if (!query.trim()) return;

    const userMessage = query;
    setQuery("");
    setIsLoading(true);
    setShowChat(true);

    // Add user message to conversation
    setConversation(prev => [...prev, { type: "user", content: userMessage, steps: [] }]);

    // Close any existing event source
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      // Create the request body with chatId and userId
      const body = JSON.stringify({
        businessId: "kAfERda28NuXqxD0EqcL", // This could be made dynamic
        user_query: userMessage,
        chatId: chatId,
        userId: userId
      });

      // Initialize the SSE connection for streaming
      const url = 'http://localhost:8000/analyze';

      // Instead of using fetch directly, use EventSource through a custom implementation
      // that allows POST requests
      const fetchSSE = async () => {
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'text/event-stream'
            },
            body: body
          });

          if (!response.ok) {
            throw new Error(`Error: ${response.status}`);
          }

          // Initialize streaming response
          const reader = response.body.getReader();
          const decoder = new TextDecoder();

          // Initialize a new AI message with empty steps
          setCurrentStreamingMessage({
            type: "ai",
            content: userMessage,
            steps: [],
            isStreaming: true,
            totalSteps: 0,
            currentStep: null
          });

          let streamedSteps: any[] = [];

          // Process the stream
          const processStream = async () => {
            let buffer = '';

            while (true) {
              const { value, done } = await reader.read();

              if (done) {
                // Process any remaining data in buffer
                if (buffer.trim()) {
                  processEventData(buffer);
                }
                break;
              }

              // Append decoded text to buffer
              buffer += decoder.decode(value, { stream: true });

              // Process complete SSE messages (each starts with "data: " and ends with "\n\n")
              const messages = buffer.split('\n\n');
              buffer = messages.pop() || ''; // Keep the last incomplete chunk in buffer

              for (const message of messages) {
                if (message.trim().startsWith('data: ')) {
                  const eventData = message.trim().substring(6); // Remove "data: " prefix
                  processEventData(eventData);
                }
              }
            }
          };

          // Process individual SSE event data
          const processEventData = (eventData: string) => {
            try {
              const data = JSON.parse(eventData);

              if (data.error) {
                // Handle error
                setConversation(prev => [...prev, {
                  type: "error",
                  content: data.error,
                  steps: []
                }]);
                setCurrentStreamingMessage(null);
                return;
              }

              if (data.type === "init") {
                // Initialize with total steps information
                setCurrentStreamingMessage(prev => ({
                  ...prev,
                  totalSteps: data.total_steps
                }));
              }
              else if (data.type === "step_start") {
                // Update current step being processed
                setCurrentStreamingMessage(prev => ({
                  ...prev,
                  currentStep: {
                    index: data.step_index,
                    instruction: data.instruction,
                    status: "processing"
                  }
                }));
              }
              else if (data.type === "step_complete" || data.type === "step_error") {
                // Add completed step
                const newStep = {
                  instruction: data.instruction,
                  response: data.type === "step_complete" ? data.response : data.error,
                  status: data.type === "step_complete" ? "complete" : "error"
                };

                streamedSteps = [...streamedSteps, newStep];

                setCurrentStreamingMessage(prev => ({
                  ...prev,
                  steps: streamedSteps,
                  currentStep: null
                }));
              }
              else if (data.type === "complete") {
                // Finalize the AI message
                setConversation(prev => [...prev, {
                  type: "ai",
                  content: userMessage,
                  steps: streamedSteps
                }]);
                setCurrentStreamingMessage(null);
              }
            } catch (e) {
              console.error("Error parsing JSON from stream:", e, eventData);
            }
          };

          // Start processing the stream
          await processStream();

        } catch (error) {
          console.error("Error fetching SSE:", error);
          setConversation(prev => [...prev, {
            type: "error",
            content: "Sorry, I encountered an error processing your request. Please try again.",
            steps: []
          }]);
          setCurrentStreamingMessage(null);
        } finally {
          setIsLoading(false);
        }
      };

      // Execute the SSE fetch
      fetchSSE();

    } catch (error) {
      console.error("Error setting up request:", error);
      setConversation(prev => [...prev, {
        type: "error",
        content: "Sorry, I encountered an error processing your request. Please try again.",
        steps: []
      }]);
      setCurrentStreamingMessage(null);
      setIsLoading(false);
    }
  };

  // Cancel streaming if needed
  const cancelStreaming = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsLoading(false);
      setCurrentStreamingMessage(null);
      setConversation(prev => [...prev, {
        type: "error",
        content: "Request was cancelled.",
        steps: []
      }]);
    }
  };

  // Render the currently streaming message
  const renderStreamingMessage = () => {
    if (!currentStreamingMessage) return null;

    return (
      <div className="flex flex-col mb-4">
        <div className="flex items-start">
          <div className="bg-gray-100 rounded-lg py-3 px-4 max-w-[90%]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <span className="text-black font-semibold text-sm">atlas</span>
                <span className="text-pink-600 text-sm">AI</span>
              </div>

              {currentStreamingMessage.isStreaming && (
                <div className="flex items-center">
                  <span className="text-xs text-gray-500 mr-2">
                    {currentStreamingMessage.steps.length}/{currentStreamingMessage.totalSteps} steps
                  </span>
                  <Button
                    onClick={cancelStreaming}
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>

            <p className="text-gray-800 mb-4">
              Processing your query: "{currentStreamingMessage.content}"
            </p>

            {/* Completed steps */}
            {currentStreamingMessage.steps.map((step: any, idx: any) => renderStep(step, idx))}

            {/* Currently processing step */}
            {currentStreamingMessage.currentStep && renderStep(currentStreamingMessage.currentStep, 'current')}

            {currentStreamingMessage.isStreaming && (
              <div className="flex items-center text-xs text-gray-500 mt-2">
                <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                Analyzing data...
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">

      <Header />

      {!showChat ? (
        <div className="flex flex-col items-center justify-center flex-grow px-4 max-w-2xl mx-auto w-full">
          <Preview
            business="RK Stores"
          />

          <Card className="w-full shadow-sm bg-gray-50 border border-gray-200">
            <CardContent className="p-4">
              <form onSubmit={handleSubmit}>
                <p className="text-sm mb-2 text-gray-700">Ask a question...</p>
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. top selling products"
                  className="w-full rounded-md border-gray-300 bg-white mb-4"
                />
                <div className="flex justify-between w-full">
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" className="rounded-md text-xs flex items-center gap-1 bg-white">
                      <Library className="w-3 h-3" />
                      <span>Prompt library</span>
                      <span className="text-gray-500">↗</span>
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="rounded-md text-xs flex items-center gap-1 bg-white">
                      <MessageSquare className="w-3 h-3" />
                      <span>Conversations</span>
                      <span className="text-gray-500">↗</span>
                    </Button>
                  </div>
                  <Button
                    type="submit"
                    disabled={isLoading || !query.trim()}
                    className="rounded-md bg-black text-white hover:bg-gray-900 text-xs flex items-center gap-1"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Processing...</span>
                      </>
                    ) : (
                      <>
                        <span>Ask atlas</span>
                        <ChevronRight className="w-3 h-3" />
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="flex-grow flex flex-col h-full">
          <div className="flex-grow overflow-auto px-4 py-6 max-w-4xl mx-auto w-full">
            {conversation.map(renderMessage)}
            {currentStreamingMessage && renderStreamingMessage()}
            <div ref={chatEndRef} />
          </div>

          <div className="border-t px-4 py-4">
            <div className="max-w-4xl mx-auto w-full">
              <form onSubmit={handleSubmit} className="flex gap-2">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ask another question..."
                  className="flex-grow rounded-md border-gray-300"
                  disabled={isLoading}
                />
                <Button
                  type="submit"
                  disabled={isLoading || !query.trim()}
                  className="rounded-md bg-black text-white hover:bg-gray-900"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </Button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AtlasAI;