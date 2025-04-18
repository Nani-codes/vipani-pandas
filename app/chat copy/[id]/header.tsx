import { User, Search, ChevronRight, MessageSquare, Library, Loader2 } from "lucide-react";


export const Header = () => {
  return (
    <header className="w-full flex justify-between items-center py-4 px-4 md:px-12 lg:px-60 border-b">
    <div className="flex items-center flex-col">
      <div className="flex items-center">
        <span className="text-black font-semibold text-3xl">atlas</span>
        <span className="text-pink-600 text-3xl">AI</span>
      </div>
      <span className="text-xs text-gray-500 ml-1">powered by vipani</span>
    </div>

    <div className="flex gap-4">
      <Search className="w-5 h-5 text-gray-600 cursor-pointer" />
      <User className="w-5 h-5 text-gray-600 cursor-pointer" />
    </div>
  </header>
  );
}