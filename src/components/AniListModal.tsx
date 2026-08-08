import { useState } from "react";
import { X, Sparkles, Check, Key, LogOut, ExternalLink, Clipboard, HelpCircle } from "lucide-react";
import { UserProfile } from "../types";
import { StorageService } from "../services/storage";

interface AniListModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  onProfileUpdated: (p: UserProfile) => void;
}

export function AniListModal({
  isOpen,
  onClose,
  profile,
  onProfileUpdated,
}: AniListModalProps) {
  const [tokenInput, setTokenInput] = useState(profile.anilistToken || "");
  const [statusMessage, setStatusMessage] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  if (!isOpen) return null;

  // AniList official token prompt client ID
  const handleOpenAuthUrl = async () => {
    const url = "https://anilist.co/api/v2/oauth/authorize?client_id=2699&response_type=token";
    try {
      const plugin = await import("@tauri-apps/plugin-opener");
      if ("openUrl" in plugin) {
        await (plugin as any).openUrl(url);
      } else if ("open" in plugin) {
        await (plugin as any).open(url);
      } else {
        window.open(url, "_blank");
      }
    } catch {
      window.open(url, "_blank");
    }
  };

  const extractTokenFromText = (input: string): string => {
    const trimmed = input.trim();
    if (trimmed.includes("access_token=")) {
      const match = trimmed.match(/access_token=([^&]+)/);
      if (match && match[1]) return decodeURIComponent(match[1]);
    }
    return trimmed;
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setTokenInput(text);
        const token = extractTokenFromText(text);
        if (token) {
          authenticateToken(token);
        }
      }
    } catch (e) {
      console.warn("Clipboard access error:", e);
      setStatusMessage("Could not read clipboard automatically. Please paste using Ctrl+V.");
    }
  };

  const authenticateToken = async (rawToken: string) => {
    const cleanToken = extractTokenFromText(rawToken);

    if (!cleanToken) {
      setStatusMessage("Please enter or paste your AniList access token or redirect URL.");
      return;
    }

    setIsAuthenticating(true);
    setStatusMessage("Authenticating with AniList...");

    try {
      const res = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          query: `query { Viewer { id name avatar { large } bannerImage } }`,
        }),
      });

      if (!res.ok) throw new Error("Token expired or authentication failed");
      const json = await res.json();
      const viewer = json.data?.Viewer;

      if (viewer) {
        const updated: UserProfile = {
          ...profile,
          name: viewer.name || profile.name,
          avatar: viewer.avatar?.large || profile.avatar,
          anilistToken: cleanToken,
          anilistUser: {
            id: viewer.id,
            name: viewer.name,
            avatar: viewer.avatar?.large,
            bannerImage: viewer.bannerImage,
          },
        };
        StorageService.saveProfile(updated);
        onProfileUpdated(updated);
        setStatusMessage(`✓ Connected as ${viewer.name}! Progress and watchlist synced.`);
        setTimeout(onClose, 1200);
      } else {
        setStatusMessage("Token valid, but viewer profile could not be loaded.");
      }
    } catch (err: any) {
      setStatusMessage(`Authentication failed: ${err.message || "Invalid Token"}`);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleDisconnect = () => {
    const updated: UserProfile = {
      ...profile,
      anilistToken: undefined,
      anilistUser: undefined,
    };
    StorageService.saveProfile(updated);
    onProfileUpdated(updated);
    setTokenInput("");
    setStatusMessage("Disconnected from AniList.");
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content anilist-modal max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="header-titles flex items-center gap-2">
            <Sparkles size={18} className="text-purple-400" />
            <h3 className="text-base font-bold text-white">AniList Account Integration</h3>
          </div>
          <button type="button" className="close-modal-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body p-6">
          {profile.anilistUser ? (
            <div className="connected-profile-card flex items-center gap-4 bg-purple-950/20 border border-purple-800/40 p-4 rounded-xl">
              <img
                src={profile.anilistUser.avatar}
                alt={profile.anilistUser.name}
                className="anilist-avatar border-2 border-purple-500/50"
              />
              <div className="anilist-user-info flex-1">
                <h4 className="font-bold text-white text-base">{profile.anilistUser.name}</h4>
                <p className="status-online text-xs text-emerald-400 flex items-center gap-1 mt-0.5">
                  <Check size={13} /> Connected & Real-time Progress Synced
                </p>
              </div>
              <button type="button" className="btn-secondary text-rose-400 text-xs px-3 py-1.5" onClick={handleDisconnect}>
                <LogOut size={14} />
                <span>Disconnect</span>
              </button>
            </div>
          ) : (
            <div className="connect-form space-y-5">
              <p className="text-zinc-300 text-xs leading-relaxed">
                Connect your AniList account to sync your watchlist, episode progress, completed titles, and ratings automatically across all devices.
              </p>

              {/* Step 1 Card */}
              <div className="step-card bg-zinc-900/60 border border-zinc-800 p-4 rounded-xl space-y-3">
                <div className="step-header flex items-center gap-2">
                  <span className="step-number bg-purple-500/20 text-purple-400 font-bold px-2 py-0.5 rounded-md text-xs border border-purple-500/30">
                    STEP 1
                  </span>
                  <span className="font-semibold text-sm text-zinc-100">Authorize on AniList</span>
                </div>

                <button
                  type="button"
                  onClick={handleOpenAuthUrl}
                  className="auth-link-btn bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold py-2.5 px-4 rounded-lg flex items-center justify-between w-full transition"
                >
                  <span>Open AniList Permission Page</span>
                  <ExternalLink size={14} />
                </button>
              </div>

              {/* Step 2 Card */}
              <div className="step-card bg-zinc-900/60 border border-zinc-800 p-4 rounded-xl space-y-3">
                <div className="step-header flex items-center gap-2">
                  <span className="step-number bg-purple-500/20 text-purple-400 font-bold px-2 py-0.5 rounded-md text-xs border border-purple-500/30">
                    STEP 2
                  </span>
                  <span className="font-semibold text-sm text-zinc-100">Paste Token or Address Bar URL</span>
                </div>

                <div className="guidance-box text-xs text-zinc-400 leading-relaxed bg-zinc-950 p-3 rounded-lg border border-zinc-800/80">
                  <div className="flex items-start gap-2">
                    <HelpCircle size={14} className="text-purple-400 shrink-0 mt-0.5" />
                    <span>
                      After clicking <strong>Approve</strong>, copy the full URL from your browser address bar (e.g. <code className="text-purple-300">https://localhost:5001/...#access_token=...</code>) or click <strong>Paste from Clipboard</strong> below.
                    </span>
                  </div>
                </div>

                <div className="input-group space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="input-label text-xs font-medium text-zinc-400">Access Token / Redirect URL</label>
                    <button
                      type="button"
                      onClick={handlePasteFromClipboard}
                      className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 font-semibold transition"
                    >
                      <Clipboard size={13} /> Paste from Clipboard
                    </button>
                  </div>

                  <div className="input-wrapper relative">
                    <Key size={14} className="input-icon absolute left-3 top-3 text-zinc-400" />
                    <input
                      type="password"
                      placeholder="Paste access_token or full redirect URL..."
                      value={tokenInput}
                      onChange={(e) => {
                        setTokenInput(e.target.value);
                        if (statusMessage) setStatusMessage("");
                      }}
                      className="modal-text-input pl-9"
                    />
                  </div>
                </div>
              </div>

              {statusMessage && (
                <div className="status-banner bg-purple-950/40 border border-purple-800/40 p-3 rounded-lg text-xs text-purple-300 font-semibold text-center">
                  {statusMessage}
                </div>
              )}

              <button
                type="button"
                className="btn-primary w-full justify-center py-2.5 text-sm font-semibold"
                onClick={() => authenticateToken(tokenInput)}
                disabled={isAuthenticating}
              >
                <Sparkles size={16} />
                <span>{isAuthenticating ? "Verifying Token..." : "Connect & Sync Account"}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
