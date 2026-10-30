/* Pure data functions shared by the browser and the small Node test suite. */
const PondLogic = (() => {
  const DAY = 86400000;
  const validDay = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

  function parseExport(input) {
    if (!Array.isArray(input)) throw new Error("This is not a supported ChatGPT conversations JSON file. Expected a list of conversations.");
    const seen = new Set();
    const days = new Map();
    let total = 0;
    for (const conversation of input) {
      if (!conversation || typeof conversation !== "object" || !conversation.mapping || typeof conversation.mapping !== "object") continue;
      for (const [nodeId, node] of Object.entries(conversation.mapping)) {
        const message = node && node.message;
        if (!message || message.author?.role !== "user") continue;
        const key = String(message.id || `${conversation.id || conversation.title || "unknown"}:${nodeId}`);
        if (seen.has(key)) continue;
        seen.add(key);
        total++;
        const rawTime = message.create_time;
        const seconds = typeof rawTime === "number" ? rawTime : (typeof rawTime === "string" && rawTime.trim() ? Number(rawTime) : NaN);
        if (!Number.isFinite(seconds) || seconds <= 0) continue;
        const date = new Date(seconds * 1000);
        if (Number.isNaN(date.getTime())) continue;
        const day = date.toISOString().slice(0, 10);
        days.set(day, (days.get(day) || 0) + 1);
      }
    }
    if (!total) throw new Error("No user messages were found. Check that you selected conversations.json from a supported export.");
    if (total > 10000000) throw new Error("This export is too large for this version of Prompt Pond.");
    return {total, mode:"export", days:[...days].sort(([a],[b]) => a.localeCompare(b)).map(([date,count]) => ({date,count}))};
  }

  function stats(summary) {
    const days = [...summary.days].sort((a,b) => a.date.localeCompare(b.date));
    let longest = 0, streak = 0, previous = null;
    for (const item of days) {
      const current = Date.parse(`${item.date}T00:00:00Z`);
      streak = previous !== null && current - previous === DAY ? streak + 1 : 1;
      longest = Math.max(longest, streak);
      previous = current;
    }
    const busiest = days.reduce((best, day) => !best || day.count > best.count ? day : best, null);
    return {activeDays:days.length,longest,busiest};
  }

  function rangeDays(days, range) {
    if (range === "all" || !days.length) return [...days];
    const n = Number(range);
    const latest = Date.parse(`${days[days.length - 1].date}T00:00:00Z`);
    const start = new Date(latest - (n - 1) * DAY).toISOString().slice(0,10);
    return days.filter(item => item.date >= start);
  }

  function demo() {
    const days = [];
    const start = Date.UTC(2026, 8, 1);
    for (let i=0;i<42;i++) {
      const count = i % 9 === 0 ? 0 : 2 + (i * 7 % 16);
      if (count) days.push({date:new Date(start+i*DAY).toISOString().slice(0,10),count});
    }
    return {mode:"demo",total:days.reduce((sum,day)=>sum+day.count,0),days};
  }
  return {parseExport,stats,rangeDays,demo,validDay};
})();
if (typeof module !== "undefined") module.exports = PondLogic;
