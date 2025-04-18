'use client';
import React, { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight, MessageSquare, Library, Loader2, Layout } from "lucide-react";
import { Header } from "./header";
import { Preview } from "./preview";
import { renderStep, renderMessage } from "./render";
import { useParams, useSearchParams } from 'next/navigation';
import { Sidebar } from "./sidebar";
import { v4 as uuidv4 } from 'uuid';

const AtlasAI = () => {
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversation, setConversation] = useState<any[]>([]);
  const [showChat, setShowChat] = useState(false);
  const [currentStreamingMessage, setCurrentStreamingMessage] = useState<any>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<any>(null);

  const params = useParams();
  const searchParams = useSearchParams();
  const chatId = params.id as string;
  const userId = searchParams.get('userId') || '';
  const businessId = "kAfERda28NuXqxD0EqcL"; // Default business ID

  // Fetch conversation history when chatId changes
  useEffect(() => {
    if (chatId && userId) {
      fetchConversation();
    }
  }, [chatId, userId]);

  // Scroll to bottom when conversation updates
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [conversation, currentStreamingMessage]);

  // Clean up event source on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const fetchConversation = async () => {
    try {
      const response = await fetch(`http://localhost:8000/conversations/${userId}/${chatId}`);

      if (response.status === 404) {
        // New conversation
        setConversation([]);
        setShowChat(false);
        return;
      }

      if (!response.ok) throw new Error('Failed to fetch conversation');

      const data = await response.json();
      // Load all messages from the stored conversation
      setConversation(data.messages || []);
      setShowChat(data.messages && data.messages.length > 0);
      setIsFirstLoad(false);
    } catch (error) {
      console.error('Error fetching conversation:', error);
      setConversation([]);
      setShowChat(false);
    }
  };

  const saveConversation = async (messages: any[]) => {
    try {
      const firstUserMessage = messages.find(m => m.type === 'user')?.content || 'New conversation';
      const title = firstUserMessage.length > 30
        ? firstUserMessage.substring(0, 30) + '...'
        : firstUserMessage;

      // Always use PUT to update an existing conversation if it exists
      const method = isFirstLoad ? 'POST' : 'PUT';
      const endpoint = isFirstLoad
        ? `http://localhost:8000/conversations`
        : `http://localhost:8000/conversations/${chatId}`;

      const body = isFirstLoad
        ? JSON.stringify({
          id: chatId,
          userId,
          businessId,
          title,
          messages
        })
        : JSON.stringify({
          messages
        });

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body
      });

      if (!response.ok) throw new Error(`Failed to ${isFirstLoad ? 'create' : 'update'} conversation`);

      if (isFirstLoad) setIsFirstLoad(false);

    } catch (error) {
      console.error('Error saving conversation:', error);
    }
  };

  const handleSubmit = async (e: { preventDefault: () => void; }) => {
    e.preventDefault();
    if (!query.trim()) return;

    const userMessage = query;
    setQuery("");
    setIsLoading(true);
    setShowChat(true);

    // Add user message to conversation
    const updatedConversation = [...conversation, { type: "user", content: userMessage, steps: [] }];
    setConversation(updatedConversation);


    // Save conversation after adding user message
    await saveConversation(updatedConversation);

    // Close any existing event source
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      // Create the request body
      const body = JSON.stringify({
        businessId,
        user_query: userMessage
      });

      // Initialize the SSE connection
      const url = 'http://localhost:8000/analyze';

      // Fetch with streaming
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

              // Process complete SSE messages
              const messages = buffer.split('\n\n');
              buffer = messages.pop() || '';

              for (const message of messages) {
                if (message.trim().startsWith('data: ')) {
                  const eventData = message.trim().substring(6);
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
                const errorMessage = { type: "error", content: data.error, steps: [] };
                setConversation(prev => [...prev, errorMessage]);
                setCurrentStreamingMessage(null);
                saveConversation([...updatedConversation, errorMessage]);
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
                // When adding the AI response
                const aiMessage = {
                  type: "ai",
                  content: userMessage,
                  steps: streamedSteps
                };

                const finalConversation = [...updatedConversation, aiMessage];
                setConversation(finalConversation);
                setCurrentStreamingMessage(null);

                // Save the final conversation with the AI response
                saveConversation(finalConversation);
              }
            } catch (e) {
              console.error("Error parsing JSON from stream:", e, eventData);
            }
          };

          // Start processing the stream
          await processStream();

        } catch (error) {
          console.error("Error fetching SSE:", error);
          const errorMessage = {
            type: "error",
            content: "Sorry, I encountered an error processing your request. Please try again.",
            steps: []
          };
          setConversation(prev => [...prev, errorMessage]);
          setCurrentStreamingMessage(null);

          // Save conversation with error message
          saveConversation([...updatedConversation, errorMessage]);
        } finally {
          setIsLoading(false);
        }
      };

      // Execute the SSE fetch
      fetchSSE();

    } catch (error) {
      console.error("Error setting up request:", error);
      const errorMessage = {
        type: "error",
        content: "Sorry, I encountered an error processing your request. Please try again.",
        steps: []
      };
      setConversation(prev => [...prev, errorMessage]);
      setCurrentStreamingMessage(null);

      // Save conversation with error message
      saveConversation([...updatedConversation, errorMessage]);
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

      const cancelMessage = {
        type: "error",
        content: "Request was cancelled.",
        steps: []
      };

      setConversation(prev => [...prev, cancelMessage]);
      saveConversation([...conversation, cancelMessage]);
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

  const toggleSidebar = () => {
    setShowSidebar(!showSidebar);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header />

      <div className="flex flex-1">
        {showSidebar && (
          <Sidebar
            userId={userId}
            selectedConversationId={chatId}
            businessId={businessId}
          />
        )}

        <div className="flex-1 flex flex-col">
          <div className="border-b p-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleSidebar}
              className="p-1"
            >
              <Layout size={16} />
            </Button>
          </div>

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
                {conversation.map((message, idx) => renderMessage(message, idx))}
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
      </div>
    </div>
  );
};

export default AtlasAI;