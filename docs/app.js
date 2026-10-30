(() => {
  const page = document.body.dataset.page;
  const $ = id => document.getElementById(id);
  const API = (window.PROMPT_POND_API || "").replace(/\/$/, "");
  const SUMMARY_KEY = "prompt-pond-summary-v1";
  const TOKEN_KEY = "prompt-pond-key-v1";
  const fmt = number => new Intl.NumberFormat("en", {
    maximumFractionDigits: 2
  }).format(number);
  const dateFmt = day => new Date(`${day}T12:00:00Z`)
    .toLocaleDateString("en", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC"
    });

  let current = null;

  function message(id, text, error = false) {
    const el = $(id);
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("error", error);
  }

  function readLocal() {
    try {
      const raw = JSON.parse(localStorage.getItem(SUMMARY_KEY));
      if (raw &&
          Number.isSafeInteger(raw.total) &&
          Array.isArray(raw.days) &&
          ["manual", "export"].includes(raw.mode)) {
        return raw;
      }
    } catch {
      // Missing or old local data.
    }
    return null;
  }

  function saveLocal(summary) {
    try {
      localStorage.setItem(SUMMARY_KEY, JSON.stringify(summary));
      return true;
    } catch {
      return false;
    }
  }

  function token() {
    let value = localStorage.getItem(TOKEN_KEY);
    if (!value) {
      value = Array.from(
        crypto.getRandomValues(new Uint8Array(32)),
        byte => byte.toString(16).padStart(2, "0")
      ).join("");
      localStorage.setItem(TOKEN_KEY, value);
    }
    return value;
  }

  async function request(method, body) {
    if (!API) {
      throw new Error("Backend URL is not configured. Start the local server.");
    }

    const loopback = location.protocol === "https:" &&
      /^http:\/\/(127\.0\.0\.1|localhost):/.test(API);

    let response;
    try {
      response = await fetch(`${API}/api/summary`, {
        method,
        headers: {
          "Authorization": `Bearer ${token()}`,
          ...(body ? {"Content-Type": "application/json"} : {})
        },
        ...(body ? {body: JSON.stringify(body)} : {}),
        ...(loopback ? {targetAddressSpace: "loopback"} : {})
      });
    } catch {
      throw new Error(
        "Cannot reach the local server. Run node server/index.cjs on this computer; on GitHub Pages, allow the browser's local network prompt."
      );
    }

    let data = {};
    try {
      data = await response.json();
    } catch {
      // The HTTP status below still provides an error.
    }

    if (!response.ok) {
      throw new Error(data.error || `Server returned ${response.status}.`);
    }
    return data;
  }

  if (page === "import") {
    $("upload-form").addEventListener("submit", async event => {
      event.preventDefault();
      const file = $("chat-file").files[0];

      if (!file) {
        return message("import-message", "Choose a JSON file first.", true);
      }
      if (!file.name.toLowerCase().endsWith(".json") ||
          file.size > 20 * 1024 * 1024) {
        return message(
          "import-message",
          "Choose a .json file no larger than 20 MB.",
          true
        );
      }

      message("import-message", "Reading your file locally…");
      try {
        const summary = PondLogic.parseExport(
          JSON.parse(await file.text())
        );
        if (!saveLocal(summary)) {
          throw new Error(
            "Your browser could not save the summary. Check available storage and try again."
          );
        }
        location.href = "dashboard.html";
      } catch (error) {
        message(
          "import-message",
          error instanceof SyntaxError
            ? "This file does not contain valid JSON."
            : error.message,
          true
        );
      }
    });

    $("manual-form").addEventListener("submit", event => {
      event.preventDefault();
      const count = Number($("prompt-count").value);

      if (!Number.isSafeInteger(count) ||
          count < 1 || count > 10000000) {
        return message(
          "import-message",
          "Enter a whole number from 1 to 10,000,000.",
          true
        );
      }

      if (!saveLocal({total: count, mode: "manual", days: []})) {
        return message(
          "import-message",
          "Your browser could not save the count. Check available storage.",
          true
        );
      }
      location.href = "dashboard.html";
    });
  }

  if (page === "dashboard") {
    const demo = new URLSearchParams(location.search).get("demo") === "1";
    current = demo ? PondLogic.demo() : readLocal();

    if (current) render(current);

    if (!demo && API) {
      request("GET").then(data => {
        if (!current && data.summary) {
          current = data.summary;
          saveLocal(current);
          render(current);
          message(
            "dashboard-message",
            "Restored your saved summary from the backend."
          );
        }
        $("delete-button").hidden = !data.summary;
      }).catch(error => {
        if (!current) {
          message("dashboard-message", error.message, true);
        }
      });
    }

    $("range-select").addEventListener("change", () => {
      if (current) renderChart(current);
    });
    $("rate-slider").addEventListener("input", () => {
      if (current) renderWater(current);
    });

    $("save-button").addEventListener("click", async () => {
      if (!current || current.mode === "demo") return;

      $("save-button").disabled = true;
      try {
        await request("PUT", current);
        $("delete-button").hidden = false;
        message(
          "dashboard-message",
          "Summary saved. Chat text was not sent."
        );
      } catch (error) {
        message("dashboard-message", error.message, true);
      } finally {
        $("save-button").disabled = false;
      }
    });

    $("delete-button").addEventListener("click", async () => {
      if (!confirm(
        "Delete your saved summary from the backend? Your current browser preview will remain until you import another file or clear site data."
      )) return;

      try {
        await request("DELETE");
        $("delete-button").hidden = true;
        message(
          "dashboard-message",
          "Saved summary deleted from the backend."
        );
      } catch (error) {
        message("dashboard-message", error.message, true);
      }
    });
  }

  function render(summary) {
    $("empty-state").hidden = true;
    $("dashboard-content").hidden = false;

    $("data-label").textContent =
      summary.mode === "demo"
        ? "Fictional sample data · nothing saved"
        : summary.mode === "manual"
          ? "Your manually entered count · no dated history"
          : "Your imported activity · dates shown in UTC";

    $("save-button").hidden = summary.mode === "demo";
    $("delete-button").hidden = summary.mode === "demo";
    $("total-prompts").textContent = fmt(summary.total);

    const s = PondLogic.stats(summary);
    $("active-days").textContent =
      summary.mode === "manual" ? "—" : fmt(s.activeDays);
    $("busiest-count").textContent =
      s.busiest ? fmt(s.busiest.count) : "—";
    $("busiest-date").textContent =
      s.busiest ? dateFmt(s.busiest.date) : "requires dated activity";
    $("longest-streak").textContent =
      summary.mode === "manual" ? "—" : fmt(s.longest);

    renderChart(summary);
    renderWater(summary);
    renderBadges(summary, s);
  }

  function renderWater(summary) {
    const rate = Number($("rate-slider").value);
    const ml = summary.total * rate;

    $("rate-label").value = `${rate.toFixed(2)} mL`;
    $("water-amount").textContent =
      ml >= 1000 ? `${fmt(ml / 1000)} L` : `${fmt(ml)} mL`;
    $("glass-count").textContent = fmt(ml / 250);
    $("bottle-count").textContent = fmt(ml / 500);
  }

  function renderBadges(summary, s) {
    const badges = [
      ["✦", "First splash", summary.total >= 1, "At least one prompt"],
      ["◈", "Century club", summary.total >= 100, "100 prompts"],
      ["✿", "Regular visitor", s.activeDays >= 7, "Seven active days"],
      ["☀", "Week in flow", s.longest >= 7, "Seven-day streak"],
      ["✺", "Big day",
        !!s.busiest && s.busiest.count >= 20,
        "20 prompts in one day"]
    ];

    const root = $("badges");
    root.replaceChildren();

    for (const [symbol, title, earned, detail] of badges) {
      const card = document.createElement("div");
      card.className = `badge${earned ? "" : " locked"}`;

      const icon = document.createElement("span");
      icon.textContent = symbol;
      icon.setAttribute("aria-hidden", "true");

      const name = document.createElement("strong");
      name.textContent = title;

      const desc = document.createElement("small");
      desc.textContent =
        `${earned ? "Earned" : "Locked"} · ${detail}`;

      card.append(icon, name, desc);
      root.append(card);
    }
  }

  function renderChart(summary) {
    const chart = $("chart");
    const note = $("chart-summary");
    const source = PondLogic.rangeDays(
      summary.days,
      $("range-select").value
    );

    if (!source.length) {
      chart.replaceChildren();
      note.textContent = summary.mode === "manual"
        ? "A manually entered count has no dated history."
        : "No dated messages in this selection.";
      return;
    }

    const countByDay = new Map(
      source.map(d => [d.date, d.count])
    );
    const firstDay = $("range-select").value === "all"
      ? source[0].date
      : new Date(
          Date.parse(
            `${summary.days[summary.days.length - 1].date}T00:00:00Z`
          ) -
          (Number($("range-select").value) - 1) * 86400000
        ).toISOString().slice(0, 10);

    const calendar = [];
    for (
      let time = Date.parse(`${firstDay}T00:00:00Z`),
        end = Date.parse(
          `${source[source.length - 1].date}T00:00:00Z`
        );
      time <= end;
      time += 86400000
    ) {
      const date = new Date(time).toISOString().slice(0, 10);
      calendar.push({
        date,
        count: countByDay.get(date) || 0
      });
    }

    const maxBars = 48;
    const groupSize = Math.max(
      1,
      Math.ceil(calendar.length / maxBars)
    );
    const grouped = [];

    for (let i = 0; i < calendar.length; i += groupSize) {
      const chunk = calendar.slice(i, i + groupSize);
      grouped.push({
        date: chunk[0].date,
        end: chunk[chunk.length - 1].date,
        count: chunk.reduce((n, d) => n + d.count, 0)
      });
    }

    const max = Math.max(1, ...grouped.map(d => d.count));
    const svg = document.createElementNS(
      "http://www.w3.org/2000/svg", "svg"
    );
    svg.setAttribute("viewBox", "0 0 600 260");
    svg.setAttribute("aria-hidden", "true");

    const make = (name, attrs) => {
      const node = document.createElementNS(
        svg.namespaceURI, name
      );
      for (const [key, value] of Object.entries(attrs)) {
        node.setAttribute(key, String(value));
      }
      svg.append(node);
      return node;
    };

    for (let i = 0; i <= 3; i++) {
      const y = 205 - i * 55;
      make("line", {
        x1: 45, y1: y, x2: 590, y2: y, class: "grid"
      });
      const label = make("text", {x: 4, y: y + 4});
      label.textContent = String(Math.round(max * i / 3));
    }

    const width = 540 / grouped.length;
    grouped.forEach((d, i) => {
      const height = d.count / max * 160;
      const rect = make("rect", {
        x: 47 + i * width,
        y: 205 - height,
        width: Math.max(1, width - 2),
        height,
        class: "bar",
        rx: 3
      });
      const title = document.createElementNS(
        svg.namespaceURI, "title"
      );
      title.textContent =
        `${dateFmt(d.date)}` +
        `${d.end !== d.date ? ` to ${dateFmt(d.end)}` : ""}` +
        `: ${d.count} prompts`;
      rect.append(title);
    });

    const first = make("text", {x: 45, y: 237});
    first.textContent = dateFmt(calendar[0].date);

    const last = make("text", {
      x: 590, y: 237, "text-anchor": "end"
    });
    last.textContent =
      dateFmt(source[source.length - 1].date);

    chart.replaceChildren(svg);

    const count = source.reduce((n, d) => n + d.count, 0);
    const description =
      `${fmt(count)} dated prompts across ${source.length} active days, ` +
      `from ${dateFmt(calendar[0].date)} to ` +
      `${dateFmt(source[source.length - 1].date)}. ` +
      `Chart bars ${groupSize > 1
        ? `group up to ${groupSize} calendar days each`
        : "show one calendar day each"}.`;

    chart.setAttribute("aria-label", description);
    note.textContent = description;
  }
})();