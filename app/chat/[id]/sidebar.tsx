import React, { useState, useEffect } from 'react';
import { MessageSquare, PlusCircle, Trash2, Calendar, Search } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface SidebarProps {
  userId: string;
  selectedConversationId: string;
  businessId: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ userId, selectedConversationId, businessId }) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();

  useEffect(() => {
    fetchConversations();
  }, [userId]);

  const fetchConversations = async () => {
    if (!userId) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(`http://localhost:8000/conversations/${userId}`);
      if (!response.ok) throw new Error('Failed to fetch conversations');
      
      const data = await response.json();
      setConversations(data);
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const createNewConversation = () => {
    const newConversationId = uuidv4();
    router.push(`/chat/${newConversationId}?userId=${userId}`);
  };

  const deleteConversation = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!confirm('Are you sure you want to delete this conversation?')) return;
    
    try {
      const response = await fetch(`http://localhost:8000/conversations/${conversationId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) throw new Error('Failed to delete conversation');
      
      // Remove from state
      setConversations(conversations.filter(conv => conv.id !== conversationId));
      
      // If we deleted the current conversation, create a new one
      if (conversationId === selectedConversationId) {
        createNewConversation();
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
    }
  };

  const filteredConversations = conversations.filter(conv => 
    conv.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-64 bg-gray-50 border-r h-full flex flex-col">
      <div className="p-4 border-b">
        <Button 
          onClick={createNewConversation}
          className="w-full flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800"
        >
          <PlusCircle size={16} />
          New Chat
        </Button>
      </div>
      
      <div className="p-4 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
          <Input
            placeholder="Search conversations..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center p-4">
            <span>Loading...</span>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="text-center text-gray-500 p-4">
            {searchQuery ? 'No conversations found' : 'No conversations yet'}
          </div>
        ) : (
          <ul>
            {filteredConversations.map((conversation) => (
              <li 
                key={conversation.id}
                onClick={() => router.push(`/chat/${conversation.id}?userId=${userId}`)}
                className={`p-3 cursor-pointer flex items-start justify-between group hover:bg-gray-100 ${
                  selectedConversationId === conversation.id ? 'bg-gray-200' : ''
                }`}
              >
                <div className="flex items-start space-x-3 overflow-hidden">
                  <MessageSquare size={18} className="mt-0.5 flex-shrink-0" />
                  <div className="overflow-hidden">
                    <div className="text-sm font-medium truncate">{conversation.title}</div>
                    <div className="text-xs text-gray-500 flex items-center">
                      <Calendar size={12} className="mr-1" />
                      {formatDistanceToNow(new Date(conversation.updatedAt), { addSuffix: true })}
                    </div>
                  </div>
                </div>
                <button
                  onClick={(e) => deleteConversation(conversation.id, e)}
                  className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-500"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};