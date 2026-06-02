import { useNavigate, useLocation } from "react-router-dom";
import { SemossBlueLogo } from "@/assets";

const navigationLinks: { path: string; text: string }[] = [
	{ path: "/", text: "Network of Systems" },
	{ path: "/debug-comparison", text: "Debug Comparison" },
];

export const MainNavigation = () => {
	const navigate = useNavigate();
	const { pathname } = useLocation();

	return (
		<div className="bg-white border-b border-gray-200 h-14 px-4 shrink-0">
			<div className="flex items-center justify-between h-full">
				<div className="flex items-center gap-4">
					<button
						className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
						onClick={() => navigate("/")}
						type="button"
					>
						<img
							src={SemossBlueLogo}
							alt="SEMOSS"
							className="h-10"
						/>
						<span className="text-lg font-bold text-gray-900 whitespace-nowrap">
							Network of Systems
						</span>
					</button>

					<div className="h-6 w-px bg-gray-200" />

					{navigationLinks.map((link) => {
						const isActive = pathname === link.path;
						return (
							<button
								key={link.path}
								onClick={() => navigate(link.path)}
								type="button"
								className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
									isActive
										? "bg-blue-50 text-blue-700"
										: "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
								}`}
							>
								{link.text}
							</button>
						);
					})}
				</div>
			</div>
		</div>
	);
};
