export const fetchLobbyFromNextJSApp = async (lobbyId: string) => {
	try {
		const response = await fetch(
			`http://localhost:3000/api/lobbies/${lobbyId}`
		);
		if (!response.ok) {
			throw new Error("Failed to fetch lobby");
		}
		return await response.json();
	} catch (error) {
		console.error("Error fetching lobby:", error);
		return null;
	}
};
