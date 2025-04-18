"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

import { v4 as uuidv4 } from 'uuid';
export default function HomePage() {
  const [userId, setUserId] = useState("");

  const handleStart = () => {
    if (!userId.trim()) {
      alert("Please enter a valid User ID");
      return;
    }

    // Use uuidv4() to generate the conversation ID
    const conversationId = uuidv4();

    // Pass the userId along with the conversationId in the URL
    window.location.href = `/chat/${conversationId}?userId=${userId}`;
  };

  return (
    <div className="bg-neutral-50 dark:bg-neutral-900 flex flex-col items-center justify-center min-h-screen p-6">
      <motion.div
        className="max-w-4xl text-center"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
          Welcome to Data Explorer
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-300 mb-6">
          Generate SQL queries, visualize results, and gain insights with ease.
        </p>
        <input
          type="text"
          placeholder="Enter User ID"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="mb-4 p-2 border border-gray-300 rounded-lg w-full max-w-md"
        />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <Button className="px-6 py-3 text-lg" onClick={handleStart}>
            Start Exploring
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
}
