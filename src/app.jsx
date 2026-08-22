
      const A_DEFAULTS = {
        accent: "#b8556a",
        density: "comfy",
        showAvatars: true,
        surprise: true,
      };

      const FAMILY = [
        { id: "avi", name: "מתן", initial: "מ", color: "#2c5a7a" },
        { id: "ima", name: "דביר", initial: "ד", color: "#b8556a" },
        { id: "noa", name: "נטע", initial: "נ", color: "#c89456" },
        { id: "yoa", name: "לירון", initial: "ל", color: "#5a7a48" },
        { id: "maya", name: "דויד", initial: "ד", color: "#7a5a8a" },
      ];

      const DEFAULT_SECTIONS = [
        { id: "sec_produce", name: "פירות וירקות" },
        { id: "sec_dairy", name: "מוצרי חלב" },
        { id: "sec_meat", name: "בשר ודגים" },
        { id: "sec_bakery", name: "מאפים" },
        { id: "sec_frozen", name: "קפואים" },
        { id: "sec_dry", name: "יבשים" },
        { id: "sec_clean", name: "ניקיון" },
      ];

      const DAY_MS = 24 * 60 * 60 * 1000;
      const LOCAL_CACHE_KEY = "family-groceries-cache-v1";
      const REDUCED_MOTION =
        typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const ACCENT_TEXT = "#9c3f52";

      function trapTab(container, e) {
        const nodes = container.querySelectorAll(
          'button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
        );
        if (!nodes.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }

      function daysAgoLabel(d) {
        if (d <= 0) return "היום";
        if (d === 1) return "אתמול";
        return `לפני ${d} ימים`;
      }

      function uid(prefix = "i") {
        return prefix + Math.random().toString(36).slice(2, 9);
      }

      function emptyState() {
        return {
          items: [],
          history: [],
          sections: DEFAULT_SECTIONS,
          version: 1,
        };
      }

      function daysAgoFor(entry, idx) {
        if (Number.isFinite(entry.ts))
          return Math.max(0, Math.round((Date.now() - entry.ts) / DAY_MS));
        if (Number.isFinite(entry.daysAgo)) return entry.daysAgo;
        return idx * 3;
      }

      function normalizeState(raw) {
        const fallback = emptyState();
        const safe = raw && typeof raw === "object" ? raw : fallback;
        const items = Array.isArray(safe.items) ? safe.items : fallback.items;
        const history = Array.isArray(safe.history)
          ? safe.history
          : fallback.history;
        const sections = Array.isArray(safe.sections)
          ? safe.sections
          : fallback.sections;
        return {
          items,
          history: history.map((entry, idx) => ({
            ...entry,
            daysAgo: daysAgoFor(entry, idx),
          })),
          sections,
          version: Number.isFinite(safe.version)
            ? safe.version
            : fallback.version,
        };
      }

      function readCachedState() {
        try {
          const raw = localStorage.getItem(LOCAL_CACHE_KEY);
          return raw ? normalizeState(JSON.parse(raw)) : null;
        } catch (error) {
          return null;
        }
      }

      function writeCachedState(state) {
        try {
          localStorage.setItem(
            LOCAL_CACHE_KEY,
            JSON.stringify(normalizeState(state)),
          );
        } catch (error) {}
      }

      function familyById(id) {
        return FAMILY.find((f) => f.id === id) || FAMILY[0];
      }

      function reasonFor(s) {
        if (s.count >= 3 && s.mostRecentDays <= 7) return "נקנה כמעט בכל שבוע";
        if (s.count >= 2 && s.mostRecentDays <= 7)
          return "נקנה לאחרונה — אולי נגמר?";
        if (s.count >= 2 && s.mostRecentDays > 7)
          return `נגמר לפני ${Math.round(s.mostRecentDays)} ימים`;
        if (s.count === 1 && s.mostRecentDays > 7)
          return "נקנה פעם, מומלץ לחדש";
        return "מומלץ לפי ההיסטוריה";
      }

      function deriveSuggestions(history, currentItems, max = 6) {
        const onList = new Set(currentItems.map((x) => x.text));
        const stats = new Map();

        history.forEach((h, idx) => {
          const daysAgo = daysAgoFor(h, idx);
          (h.items || []).forEach((it) => {
            const s = stats.get(it.text) || {
              count: 0,
              mostRecentDays: Infinity,
              lastBy: it.by,
            };
            s.count += 1;
            if (daysAgo < s.mostRecentDays) {
              s.mostRecentDays = daysAgo;
              s.lastBy = it.by;
            }
            stats.set(it.text, s);
          });
        });

        return [...stats.entries()]
          .filter(([text]) => !onList.has(text))
          .map(([text, s]) => ({
            text,
            ...s,
            score: s.count * 2 - Math.min(s.mostRecentDays, 14) / 7,
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, max)
          .map((s) => ({ text: s.text, reason: reasonFor(s), by: s.lastBy }));
      }

      function HoldButton({
        onComplete,
        children,
        color = "#222",
        textColor,
        dur = 1100,
      }) {
        const [pct, setPct] = React.useState(0);
        const [armed, setArmed] = React.useState(false);
        const raf = React.useRef(0);
        const start = React.useRef(0);
        const active = React.useRef(false);

        const tick = (t) => {
          if (!active.current) return;
          if (!start.current) start.current = t;
          const p = Math.min(1, (t - start.current) / dur);
          setPct(p);
          if (p >= 1) {
            active.current = false;
            setPct(0);
            start.current = 0;
            onComplete && onComplete();
            return;
          }
          raf.current = requestAnimationFrame(tick);
        };

        const begin = (e) => {
          e.preventDefault();
          setArmed(false);
          active.current = true;
          start.current = 0;
          raf.current = requestAnimationFrame(tick);
        };

        const end = () => {
          active.current = false;
          start.current = 0;
          cancelAnimationFrame(raf.current);
          setPct(0);
        };

        const fill = armed ? 1 : pct;
        return (
          <button
            type="button"
            className="hotspot-s"
            onPointerDown={begin}
            onPointerUp={end}
            onPointerLeave={end}
            onPointerCancel={end}
            onClick={(e) => {
              if (e.detail !== 0) return;
              if (armed) {
                setArmed(false);
                onComplete && onComplete();
              } else {
                setArmed(true);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setArmed(false);
            }}
            onBlur={() => setArmed(false)}
            style={{
              position: "relative",
              overflow: "hidden",
              border: `1.5px dashed ${color}`,
              background: "transparent",
              color: textColor || color,
              fontSize: 14,
              fontWeight: 600,
              padding: "10px 18px",
              borderRadius: 14,
              cursor: "pointer",
              touchAction: "none",
              userSelect: "none",
              transition: "transform .12s",
              transform: fill > 0 ? "scale(.97)" : "scale(1)",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: color,
                opacity: 0.14,
                transform: `translateX(${(1 - fill) * 100}%)`,
                transition:
                  pct === 0 && !armed ? "transform .25s ease-out" : "none",
              }}
            />
            <span style={{ position: "relative", zIndex: 1 }}>{children}</span>
            <span className="sr-only">
              — לחצו החזק, או הקישו Enter פעמיים לאישור
            </span>
          </button>
        );
      }

      function HandCheckbox({ checked, color }) {
        return (
          <svg
            width="22"
            height="22"
            viewBox="0 0 22 22"
            style={{ flexShrink: 0 }}
          >
            <path
              d="M3.5 4 Q3 4.2 3 5 L3.2 17.5 Q3.4 18.2 4.2 18.2 L17.5 18 Q18.4 17.8 18.4 17 L18.2 4.6 Q18 3.8 17.2 3.8 Z"
              fill="none"
              stroke={color}
              strokeWidth="1.4"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {checked && (
              <path
                d="M5.5 11.5 Q7 13 9.5 15.5 Q12 12 17 5.5"
                fill="none"
                stroke={color}
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  strokeDasharray: 24,
                  strokeDashoffset: 0,
                  animation: "drawcheck .4s ease-out",
                }}
              />
            )}
          </svg>
        );
      }

      function Avatar({ id, size = 22, dark = false }) {
        const f = familyById(id);
        return (
          <div
            title={f.name}
            style={{
              width: size,
              height: size,
              borderRadius: "50%",
              background: dark ? f.color : `${f.color}22`,
              color: dark ? "#fff" : f.color,
              border: `1.2px solid ${f.color}`,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: '"Suez One", "Heebo"',
              fontSize: size * 0.5,
              fontWeight: 700,
              flexShrink: 0,
              lineHeight: 1,
            }}
          >
            {f.initial}
          </div>
        );
      }

      function Confetti({ fire }) {
        const pieces = React.useMemo(() => {
          if (!fire) return [];
          return Array.from({ length: 24 }).map((_, i) => ({
            left: Math.random() * 100,
            delay: Math.random() * 0.3,
            duration: 1.6 + Math.random() * 0.8,
            color: [
              "#b8556a",
              "#2c5a7a",
              "#5a7a48",
              "#c89456",
              "#7a5a8a",
              "#f7d774",
            ][i % 6],
            rot: Math.random() * 360,
            size: 6 + Math.random() * 6,
          }));
        }, [fire]);

        if (!fire || REDUCED_MOTION) return null;
        return (
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              overflow: "hidden",
              zIndex: 99,
            }}
          >
            {pieces.map((p, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  top: -20,
                  left: `${p.left}%`,
                  width: p.size,
                  height: p.size * 0.6,
                  background: p.color,
                  borderRadius: 1,
                  transform: `rotate(${p.rot}deg)`,
                  animation: `confettiFall ${p.duration}s ease-in ${p.delay}s forwards`,
                }}
              />
            ))}
          </div>
        );
      }

      function useGroceries(opts = {}) {
        const initial = React.useMemo(emptyState, []);
        const [items, setItems] = React.useState([]);
        const [history, setHistory] = React.useState([]);
        const [sections, setSections] = React.useState([]);
        const [version, setVersion] = React.useState(0);
        const [loading, setLoading] = React.useState(true);
        const [offline, setOffline] = React.useState(false);
        const [locked, setLocked] = React.useState(false);
        const [me, setMeState] = React.useState(() => {
          try {
            return localStorage.getItem("grocery-me");
          } catch (error) {
            return null;
          }
        });

        const stateRef = React.useRef(initial);
        const versionRef = React.useRef(0);
        const loadedRef = React.useRef(false);
        const lockedRef = React.useRef(false);
        const authRef = React.useRef("");
        const pendingRef = React.useRef(null);
        const postTimerRef = React.useRef(null);
        const saveSeqRef = React.useRef(0);
        const dirtyRef = React.useRef(false);
        const savingRef = React.useRef(false);
        const saveRetryDelayRef = React.useRef(2000);
        const pollTimerRef = React.useRef(null);
        const pollDelayRef = React.useRef(30000);
        const syncCbRef = React.useRef(opts.onSync);

        React.useEffect(() => {
          syncCbRef.current = opts.onSync;
        }, [opts.onSync]);
        const notify = React.useCallback((kind) => {
          syncCbRef.current && syncCbRef.current(kind);
        }, []);

        React.useEffect(() => {
          try {
            authRef.current = localStorage.getItem("grocery-pw") || "";
          } catch (error) {
            authRef.current = "";
          }
        }, []);

        React.useEffect(() => {
          stateRef.current = { items, history, sections, version };
          versionRef.current = version;
        }, [items, history, sections, version]);

        React.useEffect(() => {
          lockedRef.current = locked;
        }, [locked]);

        const applyState = React.useCallback((next) => {
          const normalized = normalizeState(next);
          setItems(normalized.items);
          setHistory(normalized.history);
          setSections(normalized.sections);
          setVersion(normalized.version);
          stateRef.current = normalized;
          versionRef.current = normalized.version;
          loadedRef.current = true;
          writeCachedState(normalized);
        }, []);

        const apiFetch = React.useCallback(
          async (method = "GET", body, passwordOverride) => {
            const headers = { Accept: "application/json" };
            const password = passwordOverride ?? authRef.current;
            if (password) headers.Authorization = `Bearer ${password}`;
            const options = { method, headers };
            if (body) {
              headers["Content-Type"] = "application/json";
              options.body = JSON.stringify(body);
            }
            return fetch("/api/state", options);
          },
          [],
        );

        const fetchState = React.useCallback(
          async ({ silent = false, password } = {}) => {
            try {
              const res = await apiFetch("GET", null, password);
              if (res.status === 401) {
                setLocked(true);
                setLoading(false);
                setOffline(false);
                return false;
              }
              if (!res.ok) throw new Error(`GET /api/state ${res.status}`);
              const remote = await res.json();
              if (dirtyRef.current || pendingRef.current || savingRef.current) {
                setLocked(false);
                setOffline(false);
                setLoading(false);
                pollDelayRef.current = 30000;
                notify("online");
                return true;
              }
              applyState(remote);
              notify("online");
              setLocked(false);
              setOffline(false);
              setLoading(false);
              pollDelayRef.current = 30000;
              return true;
            } catch (error) {
              setOffline(true);
              setLoading(false);
              notify("offline");
              if (!loadedRef.current && !silent) {
                applyState(readCachedState() || initial);
              }
              return false;
            }
          },
          [apiFetch, applyState, initial],
        );

        const flushSave = React.useCallback(async () => {
          const pending = pendingRef.current;
          if (!pending || savingRef.current) return;

          savingRef.current = true;
          const seq = ++saveSeqRef.current;
          const body = {
            items: pending.items,
            history: pending.history,
            sections: pending.sections,
            baseVersion: pending.baseVersion,
          };

          try {
            const res = await apiFetch("POST", body);
            if (res.status === 401) {
              setLocked(true);
              setOffline(false);
              return;
            }
            if (res.status === 409) {
              const latest = await res.json();
              if (pendingRef.current === pending) {
                const latestTexts = new Set(
                  (latest.items || []).map((x) =>
                    String(x.text || "").trim().toLowerCase(),
                  ),
                );
                const lost = (pending.items || []).filter(
                  (x) => !latestTexts.has(String(x.text).trim().toLowerCase()),
                );
                if (lost.length) {
                  latest.history = [
                    { id: uid("h"), ts: Date.now(), items: lost },
                    ...(Array.isArray(latest.history) ? latest.history : []),
                  ];
                }
                pendingRef.current = null;
                dirtyRef.current = false;
                saveRetryDelayRef.current = 2000;
                applyState(latest);
                notify("conflict");
              } else if (pendingRef.current) {
                pendingRef.current = {
                  ...pendingRef.current,
                  baseVersion: latest.version,
                };
                if (postTimerRef.current) clearTimeout(postTimerRef.current);
                postTimerRef.current = setTimeout(flushSave, 250);
              }
              setOffline(false);
              return;
            }
            if (!res.ok) throw new Error(`POST /api/state ${res.status}`);
            const ack = await res.json();
            if (Number.isFinite(ack.version)) {
              if (seq === saveSeqRef.current) {
                setVersion(ack.version);
                versionRef.current = ack.version;
                stateRef.current = {
                  ...stateRef.current,
                  version: ack.version,
                };
                writeCachedState(stateRef.current);
              }
              if (pendingRef.current === pending) {
                pendingRef.current = null;
                dirtyRef.current = false;
                saveRetryDelayRef.current = 2000;
                notify("saved");
              } else if (pendingRef.current) {
                pendingRef.current = {
                  ...pendingRef.current,
                  baseVersion: ack.version,
                };
                if (postTimerRef.current) clearTimeout(postTimerRef.current);
                postTimerRef.current = setTimeout(flushSave, 250);
              }
            }
            setOffline(false);
          } catch (error) {
            setOffline(true);
            notify("offline");
            if (pendingRef.current) {
              if (postTimerRef.current) clearTimeout(postTimerRef.current);
              postTimerRef.current = setTimeout(
                flushSave,
                saveRetryDelayRef.current,
              );
              saveRetryDelayRef.current = Math.min(
                30000,
                saveRetryDelayRef.current * 2,
              );
            }
          } finally {
            savingRef.current = false;
          }
        }, [apiFetch, applyState]);

        const scheduleSave = React.useCallback(
          (nextState) => {
            pendingRef.current = {
              items: nextState.items,
              history: nextState.history,
              sections: nextState.sections,
              baseVersion: versionRef.current,
            };
            if (postTimerRef.current) clearTimeout(postTimerRef.current);
            postTimerRef.current = setTimeout(flushSave, 250);
          },
          [flushSave],
        );

        const mutate = React.useCallback(
          (producer) => {
            const prev = stateRef.current;
            const next = { ...prev, ...producer(prev) };
            setItems(next.items);
            setHistory(next.history);
            setSections(next.sections);
            stateRef.current = next;
            dirtyRef.current = true;
            notify("pending");
            writeCachedState(next);
            scheduleSave(next);
          },
          [scheduleSave],
        );

        React.useEffect(() => {
          fetchState();

          const schedulePoll = (delay = pollDelayRef.current) => {
            if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
            pollTimerRef.current = setTimeout(async () => {
              if (
                !lockedRef.current &&
                document.visibilityState === "visible"
              ) {
                const ok = await fetchState({ silent: true });
                pollDelayRef.current = ok
                  ? 30000
                  : Math.min(300000, pollDelayRef.current * 2);
              }
              schedulePoll(pollDelayRef.current);
            }, delay);
          };

          const refetchNow = () => {
            if (!lockedRef.current) {
              pollDelayRef.current = 30000;
              fetchState({ silent: true });
            }
          };

          const onVisibility = () => {
            if (document.visibilityState === "visible") refetchNow();
          };

          const onOnline = () => refetchNow();

          window.addEventListener("focus", refetchNow);
          window.addEventListener("online", onOnline);
          document.addEventListener("visibilitychange", onVisibility);
          schedulePoll(30000);

          return () => {
            if (postTimerRef.current) clearTimeout(postTimerRef.current);
            if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
            window.removeEventListener("focus", refetchNow);
            window.removeEventListener("online", onOnline);
            document.removeEventListener("visibilitychange", onVisibility);
          };
        }, [fetchState]);

        const setMe = React.useCallback((id) => {
          setMeState(id);
          try {
            localStorage.setItem("grocery-me", id);
          } catch (error) {}
        }, []);

        const unlock = React.useCallback(
          async (password) => {
            const trimmed = password.trim();
            authRef.current = trimmed;
            const ok = await fetchState({ password: trimmed });
            if (ok) {
              try {
                localStorage.setItem("grocery-pw", trimmed);
              } catch (error) {}
              if (pendingRef.current) {
                if (postTimerRef.current) clearTimeout(postTimerRef.current);
                postTimerRef.current = setTimeout(flushSave, 250);
              }
            }
            return ok;
          },
          [fetchState, flushSave],
        );

        const add = React.useCallback(
          (text, qty = 1, by = me || "ima", section = null) => {
            const clean = text.trim();
            if (!clean) return;
            const key = clean.toLowerCase();
            mutate((prev) => {
              const idx = prev.items.findIndex(
                (x) => x.text.trim().toLowerCase() === key,
              );
              if (idx !== -1) {
                const ex = prev.items[idx];
                const merged = {
                  ...ex,
                  qty: ex.qty + qty,
                  done: false,
                  ts: Date.now(),
                };
                return {
                  items: [merged, ...prev.items.filter((_, i) => i !== idx)],
                  history: prev.history,
                };
              }
              return {
                items: [
                  {
                    id: uid(),
                    text: clean,
                    qty,
                    by,
                    section,
                    done: false,
                    pinned: false,
                    ts: Date.now(),
                  },
                  ...prev.items,
                ],
                history: prev.history,
              };
            });
          },
          [me, mutate],
        );

        const remove = React.useCallback(
          (id) => {
            mutate((prev) => ({
              items: prev.items.filter((x) => x.id !== id),
              history: prev.history,
            }));
          },
          [mutate],
        );

        const restoreItem = React.useCallback(
          (item) => {
            if (!item || !item.text) return;
            mutate((prev) => ({
              items: [{ ...item, id: uid() }, ...prev.items],
              history: prev.history,
            }));
          },
          [mutate],
        );

        const toggle = React.useCallback(
          (id) => {
            mutate((prev) => ({
              items: prev.items.map((x) =>
                x.id === id ? { ...x, done: !x.done } : x,
              ),
              history: prev.history,
            }));
          },
          [mutate],
        );

        const togglePin = React.useCallback(
          (id) => {
            mutate((prev) => ({
              items: prev.items.map((x) =>
                x.id === id ? { ...x, pinned: !x.pinned } : x,
              ),
              history: prev.history,
            }));
          },
          [mutate],
        );

        const setQty = React.useCallback(
          (id, qty) => {
            mutate((prev) => ({
              items: prev.items.map((x) =>
                x.id === id ? { ...x, qty: Math.max(1, qty) } : x,
              ),
              history: prev.history,
            }));
          },
          [mutate],
        );

        const setItemSection = React.useCallback(
          (id, section) => {
            mutate((prev) => ({
              items: prev.items.map((x) =>
                x.id === id ? { ...x, section: section || null } : x,
              ),
              history: prev.history,
            }));
          },
          [mutate],
        );

        const addSection = React.useCallback(
          (name) => {
            const clean = (name || "").trim();
            if (!clean) return null;
            const id = uid("sec");
            mutate((prev) => ({
              sections: [...prev.sections, { id, name: clean }],
            }));
            return id;
          },
          [mutate],
        );

        const renameSection = React.useCallback(
          (id, name) => {
            const clean = (name || "").trim();
            if (!clean) return;
            mutate((prev) => ({
              sections: prev.sections.map((s) =>
                s.id === id ? { ...s, name: clean } : s,
              ),
            }));
          },
          [mutate],
        );

        const removeSection = React.useCallback(
          (id) => {
            mutate((prev) => ({
              sections: prev.sections.filter((s) => s.id !== id),
              items: prev.items.map((x) =>
                x.section === id ? { ...x, section: null } : x,
              ),
            }));
          },
          [mutate],
        );

        const restoreSection = React.useCallback(
          (section, index, itemIds) => {
            if (!section || !section.id) return;
            mutate((prev) => {
              if (prev.sections.some((s) => s.id === section.id)) return {};
              const next = [...prev.sections];
              next.splice(
                Math.max(0, Math.min(index ?? next.length, next.length)),
                0,
                section,
              );
              const ids = new Set(itemIds || []);
              return {
                sections: next,
                items: prev.items.map((x) =>
                  ids.has(x.id) ? { ...x, section: section.id } : x,
                ),
              };
            });
          },
          [mutate],
        );

        const reorderSections = React.useCallback(
          (from, to) => {
            mutate((prev) => {
              if (
                from < 0 ||
                to < 0 ||
                from >= prev.sections.length ||
                to >= prev.sections.length
              )
                return {};
              const next = [...prev.sections];
              const [moved] = next.splice(from, 1);
              next.splice(to, 0, moved);
              return { sections: next };
            });
          },
          [mutate],
        );

        const reorder = React.useCallback(
          (fromIdx, toIdx) => {
            mutate((prev) => {
              if (
                toIdx < 0 ||
                toIdx >= prev.items.length ||
                fromIdx === toIdx
              ) {
                return { items: prev.items, history: prev.history };
              }
              const nextItems = prev.items.slice();
              const [it] = nextItems.splice(fromIdx, 1);
              nextItems.splice(toIdx, 0, it);
              return { items: nextItems, history: prev.history };
            });
          },
          [mutate],
        );

        const reset = React.useCallback(
          () => {
            const current = stateRef.current.items;
            if (!current.length) return null;
            const clearing = current.filter((x) => !x.pinned);
            const archiveEntry = clearing.length
              ? {
                  id: uid("h"),
                  ts: Date.now(),
                  items: clearing.map(({ id, ...rest }) => ({ ...rest })),
                }
              : null;
            mutate((prev) => ({
              history: archiveEntry
                ? [archiveEntry, ...prev.history]
                : prev.history,
              items: prev.items
                .filter((x) => x.pinned)
                .map((x) => ({ ...x, done: false })),
            }));
            return archiveEntry ? archiveEntry.id : null;
          },
          [mutate],
        );

        const undoReset = React.useCallback(
          (histId) => {
            mutate((prev) => {
              const entry = prev.history.find((h) => h.id === histId);
              if (!entry) return {};
              const restored = (entry.items || []).map((x) => ({
                id: uid(),
                text: x.text,
                qty: x.qty || 1,
                by: x.by || "ima",
                section: x.section || null,
                done: false,
                pinned: false,
                ts: Date.now(),
              }));
              return {
                history: prev.history.filter((h) => h.id !== histId),
                items: [...restored, ...prev.items],
              };
            });
          },
          [mutate],
        );

        const restoreFromHistory = React.useCallback(
          (histId) => {
            const h = stateRef.current.history.find((x) => x.id === histId);
            if (!h) return;
            mutate((prev) => {
              const existing = new Set(
                prev.items.map((x) => String(x.text).trim().toLowerCase()),
              );
              const adds = (h.items || [])
                .filter(
                  (x) =>
                    !existing.has(String(x.text).trim().toLowerCase()),
                )
                .map((x) => ({
                  id: uid(),
                  text: x.text,
                  qty: x.qty || 1,
                  by: x.by || me || "ima",
                  section: x.section || null,
                  done: false,
                  pinned: false,
                  ts: Date.now(),
                }));
              return { items: [...adds, ...prev.items], history: prev.history };
            });
          },
          [me, mutate],
        );

        const addSuggestion = React.useCallback(
          (text) => add(text, 1, me || "ima"),
          [add, me],
        );

        return {
          items,
          history,
          sections,
          version,
          loading,
          offline,
          locked,
          me,
          setMe,
          unlock,
          add,
          remove,
          restoreItem,
          toggle,
          togglePin,
          setQty,
          setItemSection,
          addSection,
          renameSection,
          removeSection,
          restoreSection,
          reorderSections,
          reorder,
          reset,
          undoReset,
          restoreFromHistory,
          addSuggestion,
        };
      }

      function LockScreen({ onUnlock, accent }) {
        const [password, setPassword] = React.useState("");
        const [busy, setBusy] = React.useState(false);
        const [error, setError] = React.useState("");

        const submit = async (event) => {
          event.preventDefault();
          if (!password.trim()) return;
          setBusy(true);
          setError("");
          const ok = await onUnlock(password);
          setBusy(false);
          if (!ok) setError("הסיסמה לא נכונה");
        };

        return (
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 120,
              background: "rgba(42, 36, 26, 0.42)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
              backdropFilter: "blur(4px)",
            }}
          >
            <form
              onSubmit={submit}
              role="dialog"
              aria-modal="true"
              aria-label="כניסה לרשימה המשפחתית"
              onKeyDown={(e) => {
                if (e.key === "Tab") trapTab(e.currentTarget, e);
              }}
              style={{
                width: "min(100%, 320px)",
                background: "var(--paper)",
                border: "1px solid #c4b896",
                borderRadius: 12,
                padding: 20,
                boxShadow: "0 20px 50px -26px rgba(0,0,0,.55)",
              }}
            >
              <div
                style={{
                  fontFamily: '"Suez One", "Heebo"',
                  fontSize: 24,
                  marginBottom: 6,
                }}
              >
                רשימה משפחתית
              </div>
              <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 14 }}>
                הכניסו את הסיסמה המשותפת כדי לפתוח.
              </div>
              <input
                autoFocus
                type="password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="סיסמה"
                aria-label="סיסמה"
                dir="rtl"
                style={{
                  width: "100%",
                  border: "1px solid #d2c5a8",
                  borderRadius: 10,
                  padding: "10px 12px",
                  background: "#fff",
                  marginBottom: 10,
                }}
              />
              {error && (
                <div
                  role="alert"
                  style={{ color: "#a52a1f", fontSize: 12, marginBottom: 10 }}
                >
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={busy || !password.trim()}
                style={{
                  width: "100%",
                  border: "none",
                  borderRadius: 10,
                  background: busy || !password.trim() ? "#d4cab3" : accent,
                  color: "#fff",
                  padding: "10px 12px",
                  fontWeight: 800,
                  cursor: busy || !password.trim() ? "default" : "pointer",
                }}
              >
                {busy ? "פותח…" : "פתח"}
              </button>
            </form>
          </div>
        );
      }

      function IdentityPicker({ onPick, accent }) {
        return (
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 110,
              background: "rgba(239, 232, 216, 0.86)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
              backdropFilter: "blur(3px)",
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="מי אתה? בחירת משתמש"
              onKeyDown={(e) => {
                if (e.key === "Tab") trapTab(e.currentTarget, e);
              }}
              style={{
                width: "min(100%, 340px)",
                background: "var(--paper)",
                border: "1px solid #c4b896",
                borderRadius: 14,
                padding: 22,
                textAlign: "center",
                boxShadow: "0 20px 50px -28px rgba(0,0,0,.5)",
              }}
            >
              <div
                style={{
                  fontFamily: '"Suez One", "Heebo"',
                  fontSize: 26,
                  marginBottom: 6,
                }}
              >
                מי אתה?
              </div>
              <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 18 }}>
                בחרו מי מוסיף עכשיו לרשימה
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                {FAMILY.map((f) => (
                  <button
                    type="button"
                    key={f.id}
                    autoFocus={f.id === FAMILY[0].id}
                    onClick={() => onPick(f.id)}
                    style={{
                      border: `2px solid ${f.color}`,
                      background: "#fff",
                      color: f.color,
                      borderRadius: 12,
                      padding: 10,
                      cursor: "pointer",
                      width: 82,
                      boxShadow: `0 4px 0 ${accent}22`,
                    }}
                  >
                    <Avatar id={f.id} size={56} dark />
                    <div
                      style={{ marginTop: 7, fontSize: 13, fontWeight: 700 }}
                    >
                      {f.name}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      }

      function HistorySheet({ history, onClose, onRestore, accent }) {
        const cardRef = React.useRef(null);
        React.useEffect(() => {
          const prev = document.activeElement;
          const firstBtn =
            cardRef.current && cardRef.current.querySelector("button");
          if (firstBtn) firstBtn.focus();
          const onKey = (e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              onClose();
            } else if (e.key === "Tab" && cardRef.current) {
              trapTab(cardRef.current, e);
            }
          };
          document.addEventListener("keydown", onKey, true);
          return () => {
            document.removeEventListener("keydown", onKey, true);
            if (prev && prev.focus) prev.focus();
          };
        }, [onClose]);
        const entries = (history || []).slice(0, 10);
        return (
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) onClose();
            }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 200,
              background: "rgba(42, 36, 26, 0.42)",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
              backdropFilter: "blur(3px)",
            }}
          >
            <div
              ref={cardRef}
              role="dialog"
              aria-modal="true"
              aria-label="היסטוריית קניות"
              style={{
                width: "min(100%, 480px)",
                maxHeight: "70vh",
                overflowY: "auto",
                background: "var(--paper)",
                borderRadius: "18px 18px 0 0",
                borderTop: `2px solid ${accent}`,
                padding:
                  "18px 18px calc(18px + env(safe-area-inset-bottom))",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    fontFamily: '"Suez One", "Heebo"',
                    fontSize: 20,
                  }}
                >
                  קניות קודמות
                </div>
                <button
                  type="button"
                  className="hotspot"
                  onClick={onClose}
                  aria-label="סגור היסטוריה"
                  style={{
                    border: "none",
                    background: "var(--paper-deep)",
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    cursor: "pointer",
                    fontWeight: 700,
                    color: "var(--ink)",
                  }}
                >
                  ✕
                </button>
              </div>
              {entries.length === 0 ? (
                <div
                  style={{
                    color: "#6b6048",
                    fontStyle: "italic",
                    padding: "8px 2px 16px",
                    fontSize: 14,
                  }}
                >
                  עדיין אין קניות שמורות. הן נאספות כשמתחילים דף חדש.
                </div>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {entries.map((h) => (
                    <li
                      key={h.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "12px 2px",
                        borderTop: "1px dashed var(--desk)",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {(h.items || [])
                            .map((x) => x.text)
                            .slice(0, 3)
                            .join(" · ")}
                          {(h.items || []).length > 3
                            ? ` · עוד ${(h.items || []).length - 3}`
                            : ""}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "#6b6048",
                            marginTop: 2,
                          }}
                        >
                          {daysAgoLabel(h.daysAgo || 0)} ·{" "}
                          {(h.items || []).length} פריטים
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onRestore(h.id, (h.items || []).length)
                        }
                        disabled={!(h.items || []).length}
                        style={{
                          flexShrink: 0,
                          border: "none",
                          background: accent,
                          color: "#fff",
                          borderRadius: 999,
                          padding: "9px 16px",
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        שחזרו
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        );
      }

      function PinIcon({ active, color }) {
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M14 3 21 10 18 11.5 14.5 15 15 21 12 18 9 21 9.5 15 6 11.5 3 10 10 3Z"
              fill={active ? color : "none"}
              stroke={color}
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
        );
      }

      function ItemRow({
        it,
        rowH,
        accent,
        dragging,
        dragDisabled,
        onDragStart,
        g,
        showAvatars,
        announce,
        showToast,
      }) {
        const isDragging = dragging === it.id;
        const [deleting, setDeleting] = React.useState(false);
        const [secMenu, setSecMenu] = React.useState(false);
        const [menuPos, setMenuPos] = React.useState(null);
        const secMenuRef = React.useRef(null);
        const menuRef = React.useRef(null);

        React.useEffect(() => {
          if (!secMenu) return;
          const handler = (ev) => {
            const inIcon =
              secMenuRef.current && secMenuRef.current.contains(ev.target);
            const inMenu = menuRef.current && menuRef.current.contains(ev.target);
            if (!inIcon && !inMenu) setSecMenu(false);
          };
          document.addEventListener("pointerdown", handler, true);
          return () =>
            document.removeEventListener("pointerdown", handler, true);
        }, [secMenu]);

        React.useEffect(() => {
          if (!secMenu || !menuRef.current) return;
          const prev = document.activeElement;
          const firstBtn = menuRef.current.querySelector("button");
          if (firstBtn) firstBtn.focus();
          const onKey = (e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setSecMenu(false);
            } else if (e.key === "Tab") {
              trapTab(menuRef.current, e);
            }
          };
          document.addEventListener("keydown", onKey, true);
          return () => {
            document.removeEventListener("keydown", onKey, true);
            if (prev && prev.focus) prev.focus();
          };
        }, [secMenu]);

        const doDelete = () => {
          setSecMenu(false);
          announce && announce(`נמחק ${it.text}`);
          setDeleting(true);
          setTimeout(() => {
            g.remove(it.id);
            showToast &&
              showToast(`נמחק ${it.text}`, () => {
                g.restoreItem(it);
                announce && announce(`${it.text} חזר לרשימה`);
              });
          }, 450);
        };

        const menuItemStyle = (cur) => ({
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          textAlign: "start",
          border: "none",
          background: cur ? "var(--paper-deep)" : "transparent",
          color: "var(--ink)",
          borderRadius: 7,
          minHeight: 44,
          padding: "8px 10px",
          fontSize: 13.5,
          fontWeight: cur ? 700 : 500,
          cursor: "pointer",
          whiteSpace: "nowrap",
        });

        return (
          <li
            className="notebook-row"
            style={{
              listStyle: "none",
              height: deleting ? 0 : rowH,
              display: "flex",
              alignItems: "center",
              gap: 10,
              position: "relative",
              opacity: deleting ? 0 : isDragging ? 0.6 : 1,
              transform: deleting
                ? "scale(0.94) rotate(-1.5deg)"
                : isDragging
                  ? "scale(1.02)"
                  : "none",
              transformOrigin: "right center",
              transition: deleting
                ? "height .3s ease .12s, transform .3s ease .12s, opacity .38s ease"
                : "transform .15s, opacity .15s",
              overflow: deleting ? "hidden" : "visible",
              pointerEvents: deleting ? "none" : undefined,
              zIndex: isDragging ? 10 : 1,
              background: "var(--paper)",
              touchAction: "pan-y",
              userSelect: "none",
            }}
          >
            {deleting && (
              <svg
                width="100%"
                height="100%"
                viewBox="0 0 300 40"
                preserveAspectRatio="none"
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  zIndex: 5,
                }}
              >
                <path
                  d="M6 25 Q42 11 80 22 T152 20 T224 25 T296 15"
                  fill="none"
                  stroke={accent}
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    strokeDasharray: 360,
                    animation: "scribbleStrike .3s ease-out forwards",
                  }}
                />
              </svg>
            )}
            {/* item drag-reorder removed — sections provide ordering */}

            <button
              type="button"
              className="hotspot"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                g.toggle(it.id);
                announce &&
                  announce(
                    it.done
                      ? `${it.text} סומן כלא נקנה`
                      : `${it.text} סומן כנקנה`,
                  );
              }}
              aria-label={
                it.done
                  ? `סמן את ${it.text} כלא נקנה`
                  : `סמן את ${it.text} כנקנה`
              }
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: 6,
                display: "flex",
              }}
            >
              <HandCheckbox checked={it.done} color={accent} />
            </button>

            <div
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 17,
                fontWeight: 500,
                color: it.done ? "rgba(42,36,26,.55)" : "var(--ink)",
                textDecoration: it.done ? "line-through" : "none",
                textDecorationColor: accent,
                textDecorationThickness: 1.5,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {it.pinned && (
                <span
                  style={{
                    background: "#f7d774",
                    color: "#5a3a10",
                    fontSize: 9,
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: 3,
                    boxShadow:
                      "0 1px 2px rgba(0,0,0,.1), -1px 1px 0 rgba(0,0,0,.04)",
                    transform: "rotate(-2deg)",
                    flexShrink: 0,
                  }}
                >
                  קבוע
                </span>
              )}
              <span
                title={it.text}
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {it.text}
              </span>
              {it.qty > 1 && (
                <span
                  style={{
                    fontFamily: "monospace",
                    fontSize: 13,
                    opacity: 0.7,
                    background: "var(--paper-deep)",
                    padding: "1px 6px",
                    borderRadius: 6,
                    flexShrink: 0,
                  }}
                >
                  ×{it.qty}
                </span>
              )}
            </div>

            {showAvatars !== false && <Avatar id={it.by} size={22} />}

            <span ref={secMenuRef} style={{ flexShrink: 0 }}>
              <button
                type="button"
                className="row-del hotspot"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  if (secMenu) {
                    setSecMenu(false);
                    return;
                  }
                  const r = e.currentTarget.getBoundingClientRect();
                  const menuW = 188;
                  let left = r.right - menuW;
                  if (left < 8) left = 8;
                  if (left + menuW > window.innerWidth - 8)
                    left = window.innerWidth - 8 - menuW;
                  const openUp =
                    window.innerHeight - r.bottom < 340 && r.top > 340;
                  setMenuPos({
                    left: Math.round(left),
                    top: openUp ? null : Math.round(r.bottom + 4),
                    bottom: openUp
                      ? Math.round(window.innerHeight - r.top + 4)
                      : null,
                  });
                  setSecMenu(true);
                }}
                aria-label={`אפשרויות עבור ${it.text}`}
                title="אפשרויות"
                aria-haspopup="menu"
                aria-expanded={secMenu}
                style={{
                  width: 34,
                  height: 34,
                  border: "none",
                  background: secMenu ? "var(--paper-deep)" : "transparent",
                  color: "var(--ink)",
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  opacity: secMenu ? 1 : 0.7,
                }}
              >
                <svg width="4" height="16" viewBox="0 0 4 16" aria-hidden="true">
                  <circle cx="2" cy="2.5" r="1.6" fill="#2a241a" />
                  <circle cx="2" cy="8" r="1.6" fill="#2a241a" />
                  <circle cx="2" cy="13.5" r="1.6" fill="#2a241a" />
                </svg>
              </button>
              {secMenu &&
                menuPos &&
                 ReactDOM.createPortal(
                   <div
                     ref={menuRef}
                     dir="rtl"
                     role="menu"
                     aria-label={`פעולות עבור ${it.text}`}
                     style={{
                      position: "fixed",
                      left: menuPos.left,
                      top: menuPos.top != null ? menuPos.top : undefined,
                      bottom:
                        menuPos.bottom != null ? menuPos.bottom : undefined,
                      background: "#fff",
                      border: "1px solid rgba(0,0,0,.12)",
                      borderRadius: 10,
                      boxShadow: "0 12px 28px -8px rgba(0,0,0,.45)",
                      zIndex: 9999,
                      minWidth: 188,
                      maxHeight: 340,
                      overflowY: "auto",
                      padding: 4,
                    }}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => {
                        g.togglePin(it.id);
                        setSecMenu(false);
                        announce &&
                          announce(
                            it.pinned
                              ? `הצמדת ${it.text} בוטלה`
                              : `${it.text} הוצמד לראש הרשימה`,
                          );
                      }}
                      style={menuItemStyle(false)}
                    >
                      <PinIcon active={it.pinned} color={accent} />
                      <span style={{ flex: 1 }}>
                        {it.pinned ? "בטל קיבוע" : "קבע פריט"}
                      </span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={doDelete}
                      style={{ ...menuItemStyle(false), color: "#a52a1f" }}
                    >
                      <span
                        style={{
                          width: 16,
                          textAlign: "center",
                          fontSize: 14,
                          flexShrink: 0,
                        }}
                      >
                        ✕
                      </span>
                      <span style={{ flex: 1 }}>מחק פריט</span>
                    </button>
                    <div
                      style={{
                        borderTop: "1px solid rgba(0,0,0,.08)",
                        margin: "4px 6px",
                      }}
                    />
                    <div
                      style={{
                        fontSize: 11,
                        opacity: 0.72,
                        padding: "4px 10px 2px",
                      }}
                    >
                      העבר למחלקה
                    </div>
                    {[{ id: null, name: "ללא מחלקה" }, ...g.sections].map((s) => {
                      const cur = (it.section || null) === s.id;
                      return (
                        <button
                          key={s.id || "none"}
                          type="button"
                          role="menuitem"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => {
                            g.setItemSection(it.id, s.id);
                            setSecMenu(false);
                            announce &&
                              announce(
                                s.id
                                  ? `${it.text} עבר למחלקת ${s.name}`
                                  : `${it.text} עבר לללא מחלקה`,
                              );
                          }}
                          style={menuItemStyle(cur)}
                        >
                          <span
                            style={{ width: 14, color: accent, flexShrink: 0 }}
                          >
                            {cur ? "✓" : ""}
                          </span>
                          <span style={{ flex: 1 }}>{s.name}</span>
                        </button>
                      );
                    })}
                  </div>,
                  document.body,
                )}
            </span>
          </li>
        );
      }

      function SectionHeader({
        section,
        uncategorized,
        count,
        accent,
        index,
        total,
        g,
        disabled,
        collapsed,
        onToggleCollapse,
        announce,
        showToast,
      }) {
        const [editing, setEditing] = React.useState(false);
        const [name, setName] = React.useState(section ? section.name : "");
        const [secMenu, setSecMenu] = React.useState(false);
        const [menuPos, setMenuPos] = React.useState(null);
        const headerRef = React.useRef(null);
        const secMenuRef = React.useRef(null);
        const menuRef = React.useRef(null);

        React.useEffect(() => {
          if (section) setName(section.name);
        }, [section ? section.name : null]);

        React.useEffect(() => {
          if (!secMenu) return;
          const handler = (ev) => {
            const inIcon =
              secMenuRef.current && secMenuRef.current.contains(ev.target);
            const inMenu = menuRef.current && menuRef.current.contains(ev.target);
            if (!inIcon && !inMenu) setSecMenu(false);
          };
          document.addEventListener("pointerdown", handler, true);
          return () =>
            document.removeEventListener("pointerdown", handler, true);
        }, [secMenu]);

        React.useEffect(() => {
          if (!secMenu || !menuRef.current) return;
          const prev = document.activeElement;
          const firstBtn = menuRef.current.querySelector("button");
          if (firstBtn) firstBtn.focus();
          const onKey = (e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setSecMenu(false);
            } else if (e.key === "Tab") {
              trapTab(menuRef.current, e);
            }
          };
          document.addEventListener("keydown", onKey, true);
          return () => {
            document.removeEventListener("keydown", onKey, true);
            if (prev && prev.focus) prev.focus();
          };
        }, [secMenu]);

        const headerStyle = {
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginTop: 16,
          marginBottom: 2,
          paddingBottom: 3,
          borderBottom: `2px solid ${accent}55`,
        };
        const countStyle = {
          fontSize: 11,
          opacity: 0.72,
          fontFamily: "monospace",
          flexShrink: 0,
        };

        const chevron =
          count > 0 ? (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                padding: "2px",
                flexShrink: 0,
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                aria-hidden="true"
                style={{
                  transform: collapsed ? "rotate(0deg)" : "rotate(90deg)",
                  transition: "transform .15s",
                }}
              >
                <path
                  d="M4 2 L8 6 L4 10"
                  fill="none"
                  stroke={accent}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          ) : null;

        if (uncategorized) {
          return (
            <div
              style={{
                ...headerStyle,
                opacity: 0.72,
                userSelect: "none",
              }}
            >
              <h2
                style={{
                  margin: 0,
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  alignItems: "center",
                  fontFamily: '"Suez One", "Heebo"',
                  fontSize: 15,
                  fontWeight: 400,
                  color: "#6b6048",
                }}
              >
                <button
                  type="button"
                  aria-expanded={!collapsed}
                  onClick={(e) => {
                    if (e.detail !== 0 || !onToggleCollapse) return;
                    onToggleCollapse();
                    announce &&
                      announce(
                        collapsed
                          ? "מחלקת ללא מחלקה נפתחה"
                          : "מחלקת ללא מחלקה קופלה",
                      );
                  }}
                  style={{
                    font: "inherit",
                    color: "inherit",
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: onToggleCollapse ? "pointer" : "default",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    textAlign: "start",
                    minWidth: 0,
                  }}
                >
                  {chevron}
                  <span
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    ללא מחלקה
                  </span>
                </button>
              </h2>
              <span style={countStyle}>{count}</span>
            </div>
          );
        }

        const commitRename = () => {
          setEditing(false);
          const t = name.trim();
          if (t && t !== section.name) {
            g.renameSection(section.id, t);
            announce && announce(`שם המחלקה עודכן ל${t}`);
          } else setName(section.name);
        };

        const menuItemStyle = (cur) => ({
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          textAlign: "start",
          border: "none",
          background: cur ? "var(--paper-deep)" : "transparent",
          color: "var(--ink)",
          borderRadius: 7,
          minHeight: 44,
          padding: "8px 10px",
          fontSize: 13.5,
          fontWeight: cur ? 700 : 500,
          cursor: cur ? "default" : "pointer",
          whiteSpace: "nowrap",
        });

        const openMenu = (e) => {
          if (secMenu) {
            setSecMenu(false);
            return;
          }
          const r = e.currentTarget.getBoundingClientRect();
          const menuW = 200;
          let left = r.right - menuW;
          if (left < 8) left = 8;
          if (left + menuW > window.innerWidth - 8)
            left = window.innerWidth - 8 - menuW;
          const openUp = window.innerHeight - r.bottom < 260 && r.top > 260;
          setMenuPos({
            left: Math.round(left),
            top: openUp ? null : Math.round(r.bottom + 4),
            bottom: openUp
              ? Math.round(window.innerHeight - r.top + 4)
              : null,
          });
          setSecMenu(true);
        };

        const moveSec = (to) => {
          if (to < 0 || to >= total) return;
          setSecMenu(false);
          g.reorderSections(index, to);
          announce &&
            announce(
              `מחלקת ${section.name} עברה למקום ${to + 1} מתוך ${total}`,
            );
        };

        const doDeleteSection = () => {
          const affected = g.items
            .filter((x) => x.section === section.id)
            .map((x) => x.id);
          setSecMenu(false);
          g.removeSection(section.id);
          announce &&
            announce(
              `מחלקת ${section.name} נמחקה. הפריטים עברו לללא מחלקה`,
            );
          showToast &&
            showToast(`מחלקת ${section.name} נמחקה`, () => {
              g.restoreSection(section, index, affected);
              announce && announce(`מחלקת ${section.name} שוחזרה`);
            });
        };

        return (
          <div
            ref={headerRef}
            style={{
              ...headerStyle,
              position: "relative",
              cursor: disabled ? "default" : "pointer",
              userSelect: "none",
              touchAction: "manipulation",
            }}
          >
            <div
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                gap: 6,
                width: "100%",
              }}
            >
              {editing ? (
                <input
                  autoFocus
                  name="section-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={commitRename}
                  onPointerDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") {
                      setName(section.name);
                      setEditing(false);
                    }
                  }}
                  aria-label="שם המחלקה"
                  dir="rtl"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    border: "none",
                    borderBottom: `1px solid ${accent}`,
                    background: "transparent",
                    fontFamily: '"Suez One", "Heebo"',
                    fontSize: 16,
                    color: ACCENT_TEXT,
                    padding: "0 0 2px",
                  }}
                />
              ) : (
                <h2
                  style={{
                    margin: 0,
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    alignItems: "center",
                    fontFamily: '"Suez One", "Heebo"',
                    fontSize: 16,
                    fontWeight: 400,
                    color: ACCENT_TEXT,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  <button
                    type="button"
                    aria-expanded={!collapsed}
                    disabled={disabled}
                    onClick={(e) => {
                      if (e.detail !== 0 || disabled || !onToggleCollapse)
                        return;
                      onToggleCollapse();
                      announce &&
                        announce(
                          collapsed
                            ? `מחלקת ${section.name} נפתחה`
                            : `מחלקת ${section.name} קופלה`,
                        );
                    }}
                    style={{
                      font: "inherit",
                      color: "inherit",
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: disabled ? "default" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      textAlign: "start",
                      minWidth: 0,
                      flex: 1,
                    }}
                  >
                    {chevron}
                    <span
                      style={{
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {section.name}
                    </span>
                  </button>
                </h2>
              )}
              <span style={countStyle}>{count}</span>
              {!disabled && !editing && (
                <span
                  ref={secMenuRef}
                  style={{ flexShrink: 0, display: "flex" }}
                >
                  <button
                    type="button"
                    className="row-del hotspot-s"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={openMenu}
                    aria-label={`אפשרויות עבור מחלקת ${section.name}`}
                    title="עריכה, סידור ומחיקה"
                    aria-haspopup="menu"
                    aria-expanded={secMenu}
                    style={{
                      width: 30,
                      height: 30,
                      border: "none",
                      background: secMenu ? "var(--paper-deep)" : "transparent",
                      color: "var(--ink)",
                      borderRadius: 8,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      opacity: secMenu ? 1 : 0.7,
                    }}
                  >
                    <svg
                      width="4"
                      height="16"
                      viewBox="0 0 4 16"
                      aria-hidden="true"
                    >
                      <circle cx="2" cy="2.5" r="1.6" fill="#2a241a" />
                      <circle cx="2" cy="8" r="1.6" fill="#2a241a" />
                      <circle cx="2" cy="13.5" r="1.6" fill="#2a241a" />
                    </svg>
                  </button>
                  {secMenu &&
                    menuPos &&
                    ReactDOM.createPortal(
                      <div
                        ref={menuRef}
                        dir="rtl"
                        role="menu"
                        aria-label={`פעולות עבור מחלקת ${section.name}`}
                        style={{
                          position: "fixed",
                          left: menuPos.left,
                          top: menuPos.top != null ? menuPos.top : undefined,
                          bottom:
                            menuPos.bottom != null ? menuPos.bottom : undefined,
                          background: "#fff",
                          border: "1px solid rgba(0,0,0,.12)",
                          borderRadius: 10,
                          boxShadow: "0 12px 28px -8px rgba(0,0,0,.45)",
                          zIndex: 9999,
                          minWidth: 200,
                          maxHeight: 300,
                          overflowY: "auto",
                          padding: 4,
                        }}
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => {
                            setSecMenu(false);
                            setEditing(true);
                          }}
                          style={menuItemStyle(false)}
                        >
                          <span
                            style={{
                              width: 16,
                              textAlign: "center",
                              fontSize: 14,
                              flexShrink: 0,
                            }}
                          >
                            ✎
                          </span>
                          <span style={{ flex: 1 }}>ערוך שם</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          disabled={index <= 0}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => moveSec(index - 1)}
                          style={{
                            ...menuItemStyle(false),
                            opacity: index <= 0 ? 0.4 : 1,
                          }}
                        >
                          <span
                            style={{
                              width: 16,
                              textAlign: "center",
                              fontSize: 14,
                              flexShrink: 0,
                            }}
                          >
                            ↑
                          </span>
                          <span style={{ flex: 1 }}>הזז למעלה</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          disabled={index >= total - 1}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => moveSec(index + 1)}
                          style={{
                            ...menuItemStyle(false),
                            opacity: index >= total - 1 ? 0.4 : 1,
                          }}
                        >
                          <span
                            style={{
                              width: 16,
                              textAlign: "center",
                              fontSize: 14,
                              flexShrink: 0,
                            }}
                          >
                            ↓
                          </span>
                          <span style={{ flex: 1 }}>הזז למטה</span>
                        </button>
                        <div
                          style={{
                            borderTop: "1px solid rgba(0,0,0,.08)",
                            margin: "4px 6px",
                          }}
                        />
                        <button
                          type="button"
                          role="menuitem"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={doDeleteSection}
                          style={{ ...menuItemStyle(false), color: "#a52a1f" }}
                        >
                          <span
                            style={{
                              width: 16,
                              textAlign: "center",
                              fontSize: 14,
                              flexShrink: 0,
                            }}
                          >
                            ✕
                          </span>
                          <span style={{ flex: 1 }}>מחק מחלקה</span>
                        </button>
                      </div>,
                      document.body,
                    )}
                </span>
              )}
            </div>
          </div>
        );
      }

      function NotebookApp({ tweaks = A_DEFAULTS }) {
        const [live, setLive] = React.useState("");
        const announce = React.useCallback((msg) => {
          if (!msg) return;
          setLive("");
          requestAnimationFrame(() => setLive(msg));
        }, []);

        const [toast, setToast] = React.useState(null);
        const toastTimerRef = React.useRef(null);
        const showToast = React.useCallback((msg, undoFn) => {
          if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
          setToast(msg ? { msg, undoFn } : null);
          if (msg)
            toastTimerRef.current = setTimeout(() => setToast(null), 6000);
        }, []);

        const [syncNote, setSyncNote] = React.useState(null);
        const savedTimerRef = React.useRef(null);
        const lastSyncKindRef = React.useRef(null);
        const onSync = React.useCallback(
          (kind) => {
            if (kind === "pending") {
              setSyncNote("pending");
              return;
            }
            if (kind === "saved") {
              setSyncNote("saved");
              if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
              savedTimerRef.current = setTimeout(
                () => setSyncNote(null),
                2500,
              );
              return;
            }
            if (kind === "offline") {
              setSyncNote(null);
              if (lastSyncKindRef.current !== "offline")
                announce("אין חיבור — השינויים יישמרו כשהחיבור יחזור");
              lastSyncKindRef.current = kind;
              return;
            }
            if (kind === "conflict") {
              setSyncNote(null);
              announce("הרשימה עודכנה ממכשיר אחר");
              showToast(
                "התנגשות גרסאות: הרשימה עודכנה ממכשיר אחר. הפריטים שלא הספיקו להישמר נשמרו בהיסטוריה",
              );
              return;
            }
            lastSyncKindRef.current =
              kind === "online" ? null : lastSyncKindRef.current;
          },
          [announce, showToast],
        );

        React.useEffect(
          () => () => {
            if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
            if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
          },
          [],
        );

        const g = useGroceries({ onSync });
        const [draft, setDraft] = React.useState("");
        const [draftQty, setDraftQty] = React.useState(1);
        const [activeSection, setActiveSection] = React.useState(null);
        const [creatingSection, setCreatingSection] = React.useState(false);
        const [newSectionName, setNewSectionName] = React.useState("");
        const [collapsed, setCollapsed] = React.useState(() => new Set());

        const accent = tweaks.accent || A_DEFAULTS.accent;
        const rowH = tweaks.density === "compact" ? 36 : 44;
        const allDone = g.items.length > 0 && g.items.every((x) => x.done);
        const showConfetti = tweaks.surprise !== false && allDone;

        const pinned = g.items.filter((x) => x.pinned);
        const regular = g.items.filter((x) => !x.pinned);
        const orderedItems = [...pinned, ...regular];
        const q = draft.trim().toLowerCase();
        const visibleItems = q
          ? orderedItems.filter((x) => x.text.toLowerCase().includes(q))
          : orderedItems;
        const toggleCollapse = (id) =>
          setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          });
        const isCollapsed = (id) => !q && collapsed.has(id);
        const suggestions = React.useMemo(
          () => deriveSuggestions(g.history || [], g.items, 3),
          [g.history, g.items],
        );
        const [suggestOpen, setSuggestOpen] = React.useState(false);
        const [histOpen, setHistOpen] = React.useState(false);
        const chipsRowRef = React.useRef(null);
        React.useEffect(() => {
          if (!activeSection || !chipsRowRef.current) return;
          const el = chipsRowRef.current.querySelector(
            `[data-sec-chip="${activeSection}"]`,
          );
          if (el && el.scrollIntoView) {
            try {
              el.scrollIntoView({
                block: "nearest",
                inline: "center",
                behavior: REDUCED_MOTION ? "auto" : "smooth",
              });
            } catch (error) {
              el.scrollIntoView();
            }
          }
        }, [activeSection]);
        const groups = React.useMemo(() => {
          const ids = new Set(g.sections.map((s) => s.id));
          const bySec = {};
          const uncategorized = [];
          visibleItems.forEach((it) => {
            if (it.section && ids.has(it.section)) {
              (bySec[it.section] = bySec[it.section] || []).push(it);
            } else {
              uncategorized.push(it);
            }
          });
          return { bySec, uncategorized };
        }, [visibleItems, g.sections]);

        const onAdd = () => {
          if (!draft.trim()) return;
          g.add(draft, draftQty, g.me || "ima", activeSection);
          announce(`נוסף ${draft.trim()}`);
          setDraft("");
          setDraftQty(1);
        };

        const handleReset = () => {
          const hid = g.reset();
          if (!hid) {
            announce("אין מה לנקות — הרשימה כבר ריקה");
            return;
          }
          announce("נפתח דף חדש. הפריטים הקודמים נשמרו בהיסטוריה");
          showToast("דף חדש נפתח — הפריטים נשמרו בהיסטוריה", () => {
            g.undoReset(hid);
            announce("הרשימה שוחזרה");
          });
        };

        const createSection = () => {
          const t = newSectionName.trim();
          setCreatingSection(false);
          setNewSectionName("");
          if (!t) return;
          const existing = g.sections.find(
            (s) => s.name.trim().toLowerCase() === t.toLowerCase(),
          );
          if (existing) {
            setActiveSection(existing.id);
            return;
          }
          const id = g.addSection(t);
          if (id) setActiveSection(id);
        };

        const paperBackground = `
            linear-gradient(180deg, transparent 0%, transparent 32px, #d6c89c 32px, #d6c89c 33px, transparent 33px),
            repeating-linear-gradient(0deg, transparent 0, transparent 1px, rgba(120,160,200,.36) 1px, rgba(120,160,200,.36) 2px, transparent 2px, transparent ${rowH}px)
          `;

        if (g.loading) {
          return (
            <div
              dir="rtl"
              style={{
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--paper-deep)",
                color: "var(--ink)",
                fontSize: 18,
                fontWeight: 700,
              }}
            >
              טוען…
            </div>
          );
        }

        return (
          <div
            dir="rtl"
            style={{
              height: "100%",
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              background: "var(--paper-deep)",
              color: "var(--ink)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <Confetti fire={showConfetti} />

            <div
              style={{
                height: "calc(36px + env(safe-area-inset-top))",
                flexShrink: 0,
                background: "var(--desk)",
              }}
            />

            <div
              style={{
                height: 38,
                background: "var(--desk)",
                borderBottom: "1px solid #b4a583",
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-around",
                padding: "0 14px 4px",
                position: "relative",
                zIndex: 5,
                boxShadow: "0 4px 8px -4px rgba(0,0,0,.18) inset",
              }}
            >
              {Array.from({ length: 14 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: 10,
                    height: 22,
                    background: "#8a7a5a",
                    borderRadius: 5,
                    boxShadow:
                      "inset 0 -3px 0 rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.4)",
                  }}
                />
              ))}
            </div>

            <div
              style={{
                padding: "12px 22px 6px",
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div>
                <h1
                  style={{
                    margin: 0,
                    fontFamily: '"Suez One", "Heebo"',
                    fontSize: 26,
                    fontWeight: 400,
                    lineHeight: 1.05,
                    letterSpacing: 0,
                  }}
                >
                  רשימת קניות
                </h1>
                <div
                  style={{
                    fontSize: 12,
                    opacity: 0.8,
                    marginTop: 2,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span>המשפחה · {g.items.length} פריטים</span>
                  {syncNote === "pending" && (
                    <span style={{ color: "#6b6048", fontWeight: 600 }}>
                      מסנכרן…
                    </span>
                  )}
                  {syncNote === "saved" && (
                    <span role="status" style={{ color: "#4a6741", fontWeight: 700 }}>
                      נשמר ✓
                    </span>
                  )}
                  {g.offline && (
                    <span
                      style={{
                        color: "#a52a1f",
                        background: "#f5d8d4",
                        borderRadius: 6,
                        padding: "1px 6px",
                        fontWeight: 700,
                      }}
                    >
                      לא מחובר
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "row-reverse" }}>
                {FAMILY.map((f, i) => (
                  <button
                    type="button"
                    key={f.id}
                    className="hotspot"
                    onClick={() => {
                      g.setMe(f.id);
                      announce(`נכנסת בתור ${f.name}`);
                    }}
                    aria-pressed={g.me === f.id}
                    style={{
                      marginInlineStart: i === 0 ? 0 : -6,
                      cursor: "pointer",
                      boxShadow: g.me === f.id ? `0 0 0 2px ${accent}` : "none",
                      borderRadius: "50%",
                      transition: "transform .15s",
                      transform: g.me === f.id ? "translateY(-2px)" : "none",
                      border: "none",
                      background: "transparent",
                      padding: 0,
                    }}
                    aria-label={`בחר ${f.name}`}
                  >
                    <Avatar id={f.id} size={26} dark />
                  </button>
                ))}
              </div>
            </div>

            <div
              className="paper-sheet"
              style={{
                flex: 1,
                minHeight: 0,
                background: "var(--paper)",
                margin: "2px 14px calc(10px + env(safe-area-inset-bottom))",
                borderRadius: "16px 16px 18px 18px",
                boxShadow:
                  "0 1px 0 #fff inset, 0 8px 16px -10px rgba(0,0,0,.2)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  right: 32,
                  width: 1.5,
                  background: `linear-gradient(180deg, transparent 0, ${accent} 18px, ${accent} 100%)`,
                  opacity: 0.5,
                  zIndex: 2,
                  pointerEvents: "none",
                }}
              />

              <div
                className="paper-scroll"
                style={{
                  height: "100%",
                  overflowY: "auto",
                  WebkitOverflowScrolling: "touch",
                  backgroundImage: paperBackground,
                  backgroundPosition: `0 0, 0 ${8 + Math.round(rowH * 0.72)}px`,
                }}
              >
                <div key="list">
                    <div
                      style={{
                        position: "sticky",
                        top: 0,
                        zIndex: 3,
                        background: "var(--paper)",
                        padding: "16px 44px 10px 16px",
                      }}
                    >
                      <div style={{ position: "relative", marginBottom: 8 }}>
                        <div
                          aria-hidden="true"
                          style={{
                            position: "absolute",
                            insetInlineEnd: 0,
                            top: 0,
                            bottom: 0,
                            width: 24,
                            zIndex: 2,
                            pointerEvents: "none",
                            background:
                              "linear-gradient(90deg, var(--paper), rgba(250,243,224,0))",
                          }}
                        />
                        <div
                          aria-hidden="true"
                          style={{
                            position: "absolute",
                            insetInlineStart: 0,
                            top: 0,
                            bottom: 0,
                            width: 24,
                            zIndex: 2,
                            pointerEvents: "none",
                            background:
                              "linear-gradient(270deg, var(--paper), rgba(250,243,224,0))",
                          }}
                        />
                        <div
                          ref={chipsRowRef}
                          style={{
                            display: "flex",
                            gap: 6,
                            overflowX: "auto",
                            paddingBottom: 2,
                          }}
                        >
                        <span
                          aria-hidden="true"
                          style={{
                            flexShrink: 0,
                            alignSelf: "center",
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#6b6048",
                            paddingInlineEnd: 2,
                            whiteSpace: "nowrap",
                          }}
                        >
                          מוסיף אל:
                        </span>
                        <button
                          type="button"
                          className="hotspot-v"
                          onClick={() => setActiveSection(null)}
                          aria-pressed={activeSection === null}
                          style={{
                            flexShrink: 0,
                            border:
                              activeSection === null
                                ? `1.5px solid ${accent}`
                                : "1px solid var(--desk)",
                            background: activeSection === null ? accent : "#fff",
                            color: activeSection === null ? "#fff" : "var(--ink)",
                            borderRadius: 999,
                            padding: "4px 11px",
                            fontSize: 12,
                            fontWeight: activeSection === null ? 700 : 500,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          ללא מחלקה
                        </button>
                        {g.sections.map((s) => (
                          <button
                            type="button"
                            key={s.id}
                            className="hotspot-v"
                            data-sec-chip={s.id}
                            onClick={() => setActiveSection(s.id)}
                            aria-pressed={activeSection === s.id}
                            style={{
                              flexShrink: 0,
                              border:
                                activeSection === s.id
                                  ? `1.5px solid ${accent}`
                                  : "1px solid var(--desk)",
                              background: activeSection === s.id ? accent : "#fff",
                              color: activeSection === s.id ? "#fff" : "var(--ink)",
                              borderRadius: 999,
                              padding: "4px 11px",
                              fontSize: 12,
                              fontWeight: activeSection === s.id ? 700 : 500,
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {s.name}
                          </button>
                        ))}
                        {creatingSection ? (
                          <input
                            autoFocus
                            name="new-section"
                            value={newSectionName}
                            onChange={(e) => setNewSectionName(e.target.value)}
                            onBlur={createSection}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") createSection();
                              if (e.key === "Escape") {
                                setCreatingSection(false);
                                setNewSectionName("");
                              }
                            }}
                            placeholder="שם מחלקה…"
                            aria-label="שם מחלקה חדשה"
                            dir="rtl"
                            style={{
                              flexShrink: 0,
                              width: 110,
                              border: `1.5px solid ${accent}`,
                              borderRadius: 999,
                              padding: "4px 11px",
                              fontSize: 12,
                              background: "#fff",
                            }}
                          />
                        ) : (
                          <button
                            type="button"
                            className="hotspot-v"
                            onClick={() => setCreatingSection(true)}
                            style={{
                              flexShrink: 0,
                              border: `1px dashed ${accent}`,
                              background: "transparent",
                              color: ACCENT_TEXT,
                              borderRadius: 999,
                              padding: "4px 11px",
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            + מחלקה
                          </button>
                        )}
                        <button
                          type="button"
                          className="hotspot-v"
                          onClick={() => setHistOpen(true)}
                          aria-haspopup="dialog"
                          style={{
                            flexShrink: 0,
                            border: "1px solid var(--desk)",
                            background: "#fff",
                            color: "#6b6048",
                            borderRadius: 999,
                            padding: "4px 11px",
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          היסטוריה
                        </button>
                        </div>
                      </div>
                      {(suggestOpen || g.items.length === 0) && !q && suggestions.length > 0 && (
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            flexWrap: "wrap",
                            margin: "0 44px 8px 16px",
                          }}
                        >
                          {suggestions.map((sg) => (
                            <button
                              key={sg.text}
                              type="button"
                              title={sg.reason}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                g.addSuggestion(sg.text);
                                announce(`נוסף ${sg.text}`);
                                setSuggestOpen(false);
                              }}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                maxWidth: "100%",
                                border: `1px dashed ${accent}`,
                                background: "#fff",
                                color: "var(--ink)",
                                borderRadius: 999,
                                padding: "3px 10px",
                                fontSize: 12,
                                cursor: "pointer",
                              }}
                            >
                              <span
                                style={{
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {sg.text}
                              </span>
                              <span
                                style={{
                                  color: ACCENT_TEXT,
                                  fontSize: 11,
                                  fontWeight: 800,
                                }}
                              >
                                +
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          background: "#fff",
                          borderRadius: 14,
                          padding: "6px 10px",
                          boxShadow:
                            "0 4px 12px -6px rgba(0,0,0,.2), 0 0 0 1px rgba(0,0,0,.04)",
                        }}
                      >
                        <Avatar id={g.me || "ima"} size={26} dark />
                        {activeSection && (
                          <button
                            type="button"
                            className="hotspot-s"
                            onClick={() => setActiveSection(null)}
                            aria-label={`הפריטים יתווספו למחלקת ${(g.sections.find((s) => s.id === activeSection) || {}).name || ""}. לחצו לביטול`}
                            title="לחצו לביטול בחירת המחלקה"
                            style={{
                              flexShrink: 0,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 3,
                              maxWidth: 104,
                              border: `1px solid ${accent}`,
                              background: `${accent}14`,
                              color: ACCENT_TEXT,
                              borderRadius: 999,
                              padding: "2px 8px",
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            <span
                              style={{
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {
                                (g.sections.find((s) => s.id === activeSection) || {})
                                  .name
                              }
                            </span>
                            <span aria-hidden="true">✕</span>
                          </button>
                        )}
                        <input
                          className="notebook-input"
                          name="add-or-search"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && onAdd()}
                          onFocus={() => setSuggestOpen(true)}
                          onBlur={() => setSuggestOpen(false)}
                          placeholder="הוסף או חפש…"
                          aria-label="הוסף פריט או חפש ברשימה"
                          dir="rtl"
                          style={{
                            flex: 1,
                            minWidth: 0,
                            border: "none",
                            background: "transparent",
                            fontSize: 15,
                            padding: "6px 0",
                          }}
                        />
                        {draft && (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <button
                              type="button"
                              className="hotspot"
                              onClick={() =>
                                setDraftQty(Math.max(1, draftQty - 1))
                              }
                              aria-label="הפחת כמות"
                              style={{
                                background: "var(--paper-deep)",
                                border: "none",
                                width: 30,
                                height: 30,
                                borderRadius: "50%",
                                cursor: "pointer",
                                fontSize: 15,
                                fontWeight: 700,
                              }}
                            >
                              −
                            </button>
                            <span
                              style={{
                                minWidth: 18,
                                textAlign: "center",
                                fontFamily: "monospace",
                                fontSize: 14,
                              }}
                            >
                              {draftQty}
                            </span>
                            <button
                              type="button"
                              className="hotspot"
                              onClick={() => setDraftQty(draftQty + 1)}
                              aria-label="הוסף כמות"
                              style={{
                                background: "var(--paper-deep)",
                                border: "none",
                                width: 30,
                                height: 30,
                                borderRadius: "50%",
                                cursor: "pointer",
                                fontSize: 15,
                                fontWeight: 700,
                              }}
                            >
                              +
                            </button>
                          </div>
                        )}
                        {draft && (
                          <button
                            type="button"
                            onClick={() => setDraft("")}
                            aria-label="נקה"
                            style={{
                              border: "none",
                              background: "var(--paper-deep)",
                              width: 28,
                              height: 28,
                              borderRadius: "50%",
                              cursor: "pointer",
                              fontWeight: 700,
                              color: "var(--ink)",
                              lineHeight: 1,
                              flexShrink: 0,
                            }}
                          >
                            ✕
                          </button>
                        )}
                        <button
                          type="button"
                          className="hotspot-s"
                          onClick={onAdd}
                          disabled={!draft.trim()}
                          style={{
                            background: draft.trim() ? accent : "#d4cab3",
                            color: "#fff",
                            border: "none",
                            borderRadius: 10,
                            padding: "8px 14px",
                            fontSize: 14,
                            fontWeight: 700,
                            cursor: draft.trim() ? "pointer" : "default",
                            transition: "background .15s",
                            flexShrink: 0,
                          }}
                        >
                          הוסף
                        </button>
                      </div>
                    </div>

                    <div
                      style={{
                        animation: "pageFlip .25s ease-out",
                        padding: "2px 44px 96px 16px",
                      }}
                    >

                    {g.items.length === 0 && (
                      <div
                        style={{
                          textAlign: "center",
                          color: "#6b6048",
                          marginTop: 56,
                          fontStyle: "italic",
                          fontSize: 15,
                        }}
                      >
                        <div>הדף ריק. תוסיף משהו?</div>
                        <div
                          style={{
                            fontSize: 12,
                            marginTop: 10,
                            fontStyle: "normal",
                            lineHeight: 1.8,
                            color: "#5d5340",
                          }}
                        >
                          בחרו מחלקה בפס למעלה וכל הוספה תיכנס אליה ·
                          ⋯ ליד שם מחלקה — עריכה, סידור ומחיקה
                        </div>
                      </div>
                    )}

                    {g.items.length > 0 && visibleItems.length === 0 && (
                      <div
                        style={{
                          textAlign: "center",
                          color: "#6b6048",
                          marginTop: 46,
                          fontStyle: "italic",
                        }}
                      >
                        אין "{draft}" ברשימה — Enter להוספה
                      </div>
                    )}

                    {groups.uncategorized.length > 0 && (
                      <React.Fragment>
                        <SectionHeader
                          uncategorized
                          count={groups.uncategorized.length}
                          accent={accent}
                          collapsed={isCollapsed("uncat")}
                          onToggleCollapse={() => toggleCollapse("uncat")}
                          announce={announce}
                        />
                        {!isCollapsed("uncat") && (
                          <ul
                            style={{
                              listStyle: "none",
                              margin: 0,
                              padding: 0,
                            }}
                          >
                            {groups.uncategorized.map((it) => (
                              <ItemRow
                                key={it.id}
                                it={it}
                                rowH={rowH}
                                accent={accent}
                                g={g}
                                showAvatars={tweaks.showAvatars}
                                announce={announce}
                                showToast={showToast}
                              />
                            ))}
                          </ul>
                        )}
                      </React.Fragment>
                    )}
                    {g.sections.map((s, idx) => {
                      const its = groups.bySec[s.id] || [];
                      if (q && its.length === 0) return null;
                      return (
                        <React.Fragment key={s.id}>
                          <SectionHeader
                            section={s}
                            index={idx}
                            total={g.sections.length}
                            count={its.length}
                            accent={accent}
                            g={g}
                            disabled={Boolean(q)}
                            collapsed={isCollapsed(s.id)}
                            onToggleCollapse={() => toggleCollapse(s.id)}
                            announce={announce}
                            showToast={showToast}
                          />
                          {!isCollapsed(s.id) && (
                            <ul
                              style={{
                                listStyle: "none",
                                margin: 0,
                                padding: 0,
                              }}
                            >
                              {its.map((it) => (
                                <ItemRow
                                  key={it.id}
                                  it={it}
                                  rowH={rowH}
                                  accent={accent}
                                  g={g}
                                  showAvatars={tweaks.showAvatars}
                                  announce={announce}
                                  showToast={showToast}
                                />
                              ))}
                            </ul>
                          )}
                        </React.Fragment>
                      );
                    })}
                    </div>
                  </div>
              </div>
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 5,
                  display: "flex",
                  justifyContent: "center",
                  padding: "12px 16px 14px",
                  background:
                    "linear-gradient(180deg, rgba(250,243,224,0), var(--paper) 38%)",
                  pointerEvents: "none",
                }}
              >
                <div style={{ pointerEvents: "auto" }}>
                  <HoldButton
                    color={accent}
                    textColor={ACCENT_TEXT}
                    onComplete={handleReset}
                  >
                    ✂ החזיקו לפתיחת דף חדש
                  </HoldButton>
                </div>
              </div>
            </div>

            <div className="sr-only" role="status" aria-live="polite">
              {live}
            </div>

            {toast && (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 78,
                  zIndex: 60,
                  display: "flex",
                  justifyContent: "center",
                  padding: "0 16px",
                  pointerEvents: "none",
                }}
              >
                <div
                  role="status"
                  style={{
                    pointerEvents: "auto",
                    background: "var(--ink)",
                    color: "var(--paper)",
                    borderRadius: 12,
                    padding: "10px 14px",
                    fontSize: 13,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    boxShadow: "0 12px 28px -10px rgba(0,0,0,.5)",
                    animation: REDUCED_MOTION
                      ? undefined
                      : "pageFlip .25s ease-out",
                  }}
                >
                  <span>{toast.msg}</span>
                  {toast.undoFn && (
                    <button
                      type="button"
                      onClick={() => {
                        const fn = toast.undoFn;
                        setToast(null);
                        fn();
                      }}
                      style={{
                        border: "none",
                        background: "var(--paper)",
                        color: "var(--ink)",
                        borderRadius: 8,
                        padding: "7px 13px",
                        fontSize: 13,
                        fontWeight: 800,
                        cursor: "pointer",
                        flexShrink: 0,
                      }}
                    >
                      שחזרו
                    </button>
                  )}
                </div>
              </div>
            )}

            {histOpen &&
              ReactDOM.createPortal(
                <HistorySheet
                  history={g.history}
                  accent={accent}
                  onClose={() => setHistOpen(false)}
                  onRestore={(id, n) => {
                    g.restoreFromHistory(id);
                    setHistOpen(false);
                    announce(`שוחזרו ${n} פריטים מההיסטוריה`);
                  }}
                />,
                document.body,
              )}

            {g.locked && <LockScreen onUnlock={g.unlock} accent={accent} />}
            {!g.locked && g.me === null && (
              <IdentityPicker onPick={g.setMe} accent={accent} />
            )}
          </div>
        );
      }

      function App() {
        return (
          <main className="app-shell">
            <div className="phone-shell">
              <NotebookApp />
            </div>
          </main>
        );
      }

      Object.assign(window, {
        useGroceries,
        FAMILY,
        familyById,
        deriveSuggestions,
        Confetti,
        NotebookApp,
        A_DEFAULTS,
        HoldButton,
        Avatar,
      });

      ReactDOM.createRoot(document.getElementById("root")).render(<App />);
    