import React from "react";
interface PreviewProps {
  business: string;
}
export const Preview: React.FC<PreviewProps> = ({ business }) => {

    return (
        <div className="items-center flex flex-col justify-center w-full h-full p-4 bg-white dark:bg-neutral-900">
            <div className="mb-4">
                <img
                    src="../vipani-logo-dark.f5889694.svg"
                    alt="Atlas AI Logo"
                    className=""
                />
            </div>

            <h2 className="text-3xl font-bold text-gray-900 mb-2">Welcome, {business}</h2>
            <p className="text-gray-600">
                I'm Atlas AI. I assist in navigating your business intelligence and growth.
            </p>

            <div className="mt-4 mb-16 flex gap-8">
                <a href="#" className="text-teal-600 hover:underline text-sm">
                    How I can help your business?
                </a>
                <a href="#" className="text-teal-600 hover:underline text-sm">
                    Learn more about me
                </a>
            </div>

        </div>
    )
}