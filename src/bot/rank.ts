export function rankLabelHtml(rank: number): string {
	switch (rank) {
		case 1:
			return '<tg-emoji emoji-id="5794182096603847292">1️⃣</tg-emoji>';
		case 2:
			return '<tg-emoji emoji-id="5794303034292968945">2️⃣</tg-emoji>';
		case 3:
			return '<tg-emoji emoji-id="5794031944547178894">3️⃣</tg-emoji>';
		case 4:
			return '<tg-emoji emoji-id="5793901252987330401">4️⃣</tg-emoji>';
		case 5:
			return '<tg-emoji emoji-id="5794066823976592976">5️⃣</tg-emoji>';
		case 6:
			return '<tg-emoji emoji-id="5794235255414069703">6️⃣</tg-emoji>';
		default:
			return `${rank}.`;
	}
}
