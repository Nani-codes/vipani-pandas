
import { ChevronRight, MessageSquare, Library, Loader2 } from "lucide-react";

export const renderTable = (data: { value: { columns: any; data: any; }; }) => {
    if (!data || !data.value || !data.value.columns || !data.value.data) return null;

    const { columns, data: rows } = data.value;

    return (
      <div className="overflow-x-auto mt-2 mb-4">
        <table className="min-w-full bg-white border border-gray-200">
          <thead>
            <tr className="bg-gray-100">
              {columns.map((column: string | number | boolean | React.ReactElement<any, string | React.JSXElementConstructor<any>> | React.ReactFragment | React.ReactPortal | React.PromiseLikeOfReactNode | null | undefined, idx: React.Key | null | undefined) => (
                <th key={idx} className="px-4 py-2 text-sm text-left text-gray-700">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row: any[], rowIdx: React.Key | null | undefined) => (
              <tr key={rowIdx} className={(Number(rowIdx) ?? 0) % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                {row.map((cell: string | number | boolean | React.ReactElement<any, string | React.JSXElementConstructor<any>> | React.ReactFragment | React.ReactPortal | React.PromiseLikeOfReactNode | null | undefined, cellIdx: React.Key | null | undefined) => (
                  <td key={cellIdx} className="px-4 py-2 text-sm text-gray-700">
                    {typeof cell === 'number' ? Number(cell).toLocaleString() : cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // Render step content whether it's complete or in progress
export const renderStep = (step: { status: string; response: string | number | boolean | React.ReactElement<any, string | React.JSXElementConstructor<any>> | React.ReactFragment | React.PromiseLikeOfReactNode | null | undefined; instruction: string | number | boolean | React.ReactElement<any, string | React.JSXElementConstructor<any>> | React.ReactFragment | React.ReactPortal | React.PromiseLikeOfReactNode | null | undefined; }, index: React.Key | null | undefined) => {
    const isProcessing = step.status === "processing";
    let responseData = null;

    if (!isProcessing && step.response) {
      try {
        responseData = typeof step.response === 'string' && step.response.trim().startsWith('{')
          ? JSON.parse(step.response)
          : null;
      } catch (e) {
        console.error("Error parsing step response:", e);
      }
    }

    return (
      <div key={index} className="mb-4">
        <div className="text-sm text-gray-600 font-medium mb-1 flex items-center">
          {step.instruction}
          {isProcessing && <Loader2 className="w-3 h-3 ml-2 animate-spin" />}
        </div>

        {isProcessing ? (
          <div className="text-xs text-gray-500 italic">Processing...</div>
        ) : (
          <>
            {responseData && responseData.type === "dataframe" && renderTable(responseData)}

            {responseData && responseData.type === "chart" && (
              <div className="my-4">
                <img
                  src={`http://192.168.104.107:5000/${responseData.value}`}
                  alt="Chart visualization"
                  className="rounded-md border border-gray-200 max-w-full"
                />
              </div>
            )}

            {(!responseData && step.response && step.status !== "error") && (
              <div className="text-sm text-gray-700 mt-1">{step.response}</div>
            )}

            {step.status === "error" && (
              <div className="text-sm text-red-600 mt-1">{step.response}</div>
            )}
          </>
        )}
      </div>
    );
  };

  // Render a message with its associated data and charts
export const renderMessage = (message: { type: string; content: string | number | boolean | React.ReactElement<any, string | React.JSXElementConstructor<any>> | React.ReactFragment | React.PromiseLikeOfReactNode | null | undefined; steps: any[]; }, index: React.Key | null | undefined) => {
    if (message.type === "user") {
      return (
        <div key={index} className="flex justify-end mb-4">
          <div className="bg-blue-100 rounded-lg py-2 px-4 max-w-[80%]">
            <p className="text-gray-800">{message.content}</p>
          </div>
        </div>
      );
    } else if (message.type === "ai") {
      return (
        <div key={index} className="flex flex-col mb-4">
          <div className="flex items-start">
            <div className="bg-gray-100 rounded-lg py-3 px-4 max-w-[90%]">
              <div className="flex items-center mb-2">
                <div className="flex items-center">
                  <span className="text-black font-semibold text-sm">atlas</span>
                  <span className="text-pink-600 text-sm">AI</span>
                </div>
              </div>

              <p className="text-gray-800 mb-4">Here's my analysis for your query: "{message.content}"</p>

              {message.steps && message.steps.map((step: any, stepIdx: any) => renderStep(step, stepIdx))}
            </div>
          </div>
        </div>
      );
    } else if (message.type === "error") {
      return (
        <div key={index} className="flex mb-4">
          <div className="bg-red-100 rounded-lg py-2 px-4 max-w-[80%]">
            <p className="text-red-800">{message.content}</p>
          </div>
        </div>
      );
    }
    return null;
  };
