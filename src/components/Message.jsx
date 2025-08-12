import React from "react";

const Message = ({ role, content, pending }) => {
  const isUser = role === "user";
  return (
    <div
      className={`flex mb-3 w-full ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words shadow
        ${
          isUser
            ? "bg-blue-600 text-white rounded-br-sm"
            : "bg-slate-800 text-slate-100 rounded-tl-sm"
        }`}
      >
        {content}
        {pending && (
          <span className="ml-2 inline-block h-2 w-2 animate-pulse rounded-full bg-current" />
        )}
      </div>
    </div>
  );
};

export default Message;
