import React, { useState, useEffect } from "react";
import { Save, Folder, Key, HardDrive, Trash2, Check, Radio, Cpu, User, Sparkles, Zap, Palette } from "lucide-react";
import { AppSettings, PreferredQuality, UserProfile } from "../types";
import { ACCENT_PRESETS, applyAccentColor } from "../utils/theme";

interface SettingsViewProps {
  settings: AppSettings;
  onSaveSettings: (settings: AppSettings) => void;
  profile: UserProfile;
  onSaveProfile: (profile: UserProfile) => void;
  onOpenAniListModal: () => void;
}

export function SettingsView({
  settings,
  onSaveSettings,
  profile,
  onSaveProfile,
  onOpenAniListModal,
}: SettingsViewProps) {
  const [formData, setFormData] = useState<AppSettings>({ ...settings });
  const [profileData, setProfileData] = useState<UserProfile>({ ...profile });
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleChange = (field: keyof AppSettings, value: any) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "accentColor" && typeof value === "string") {
        applyAccentColor(value);
      }
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings(formData);
    onSaveProfile(profileData);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  // Jump to section when opened from command palette search
  useEffect(() => {
    try {
      const sectionId = sessionStorage.getItem("stream_settings_focus");
      if (!sectionId) return;
      sessionStorage.removeItem("stream_settings_focus");
      requestAnimationFrame(() => {
        const el = document.getElementById(sectionId);
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
        el?.classList.add("settings-card-flash");
        window.setTimeout(() => el?.classList.remove("settings-card-flash"), 1400);
      });
    } catch {
      // ignore
    }
  }, []);

  return (
    <div className="view-container settings-view">
      <div className="catalog-header">
        <div className="title-area">
          <h1>Preferences & Settings</h1>
          <p className="subtitle">Configure local user profiles, library paths, torrent engines, and indexer providers</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="settings-form">
        {/* Section 0: User Profile & Account Sync */}
        <div className="settings-card" id="settings-profile">
          <div className="card-header-row">
            <User size={18} className="text-purple-400" />
            <h3>User Profile & Account Sync</h3>
          </div>
          <div className="profile-settings-wrapper flex flex-col md:flex-row items-center gap-6">
            <div className="profile-avatar-preview relative">
              <img src={profileData.avatar} alt={profileData.name} />
              <span className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-emerald-500 border-2 border-zinc-900" />
            </div>

            <div className="profile-inputs-grid flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
              <div className="form-group">
                <label className="input-label">Display Name</label>
                <input
                  type="text"
                  value={profileData.name}
                  onChange={(e) => setProfileData((prev) => ({ ...prev, name: e.target.value }))}
                  className="setting-input"
                  placeholder="Streamer"
                />
              </div>

              <div className="form-group">
                <label className="input-label">Avatar Image URL</label>
                <input
                  type="text"
                  value={profileData.avatar}
                  onChange={(e) => setProfileData((prev) => ({ ...prev, avatar: e.target.value }))}
                  className="setting-input"
                  placeholder="https://..."
                />
              </div>
            </div>

            <div className="sync-status-box shrink-0 flex flex-col items-center md:items-end gap-2">
              <button
                type="button"
                className={`btn-secondary ${profileData.anilistUser ? "text-purple-300 border-purple-800" : ""}`}
                onClick={onOpenAniListModal}
              >
                <Sparkles size={15} className="text-purple-400" />
                <span>{profileData.anilistUser ? `Synced with ${profileData.anilistUser.name}` : "Sync with AniList"}</span>
              </button>
              <span className="text-xs text-zinc-400">
                {profileData.anilistUser ? "Real-time watchlist & episode progress enabled" : "Local offline profile"}
              </span>
            </div>
          </div>
        </div>

        {/* Section 1: Local Media Library Folders */}
        <div className="settings-card" id="settings-library">
          <div className="card-header-row">
            <Folder size={18} className="text-purple-400" />
            <h3>Local Library Media Folders</h3>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label className="input-label">Anime Library Folder</label>
              <input
                type="text"
                value={formData.animeFolder}
                onChange={(e) => handleChange("animeFolder", e.target.value)}
                className="setting-input"
                placeholder="C:\Media\Anime"
              />
            </div>
            <div className="form-group">
              <label className="input-label">Movies Library Folder</label>
              <input
                type="text"
                value={formData.moviesFolder}
                onChange={(e) => handleChange("moviesFolder", e.target.value)}
                className="setting-input"
                placeholder="C:\Media\Movies"
              />
            </div>
            <div className="form-group">
              <label className="input-label">TV Series Library Folder</label>
              <input
                type="text"
                value={formData.tvFolder}
                onChange={(e) => handleChange("tvFolder", e.target.value)}
                className="setting-input"
                placeholder="C:\Media\TV Shows"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Torrent Engine & Download Settings */}
        <div className="settings-card" id="settings-downloads">
          <div className="card-header-row">
            <HardDrive size={18} className="text-blue-400" />
            <h3>Downloads & Torrent Engine</h3>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label className="input-label">Default Download Storage Path</label>
              <input
                type="text"
                value={formData.downloadPath}
                onChange={(e) => handleChange("downloadPath", e.target.value)}
                className="setting-input"
                placeholder="C:\Downloads\Stream"
              />
            </div>
            <div className="form-group">
              <label className="input-label">Max Concurrent Downloads</label>
              <input
                type="number"
                min={1}
                max={10}
                value={formData.maxConcurrentDownloads}
                onChange={(e) => handleChange("maxConcurrentDownloads", parseInt(e.target.value, 10))}
                className="setting-input"
              />
            </div>
          </div>

          <div className="form-group full-width mt-4">
            <label className="input-label">Post-Watch File Preference</label>
            <div className="post-watch-grid">
              <button
                type="button"
                onClick={() => handleChange("postWatchBehavior", "keep")}
                className={`post-watch-card ${formData.postWatchBehavior === "keep" ? "active-keep" : ""}`}
              >
                <div className={`post-watch-icon ${formData.postWatchBehavior === "keep" ? "on" : ""}`}>
                  <HardDrive size={20} />
                </div>
                <div>
                  <div className="post-watch-title">Keep Downloads</div>
                  <div className="post-watch-desc">Preserve downloaded media files in your library</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleChange("postWatchBehavior", "delete")}
                className={`post-watch-card ${formData.postWatchBehavior === "delete" ? "active-delete" : ""}`}
              >
                <div className={`post-watch-icon danger ${formData.postWatchBehavior === "delete" ? "on" : ""}`}>
                  <Trash2 size={20} />
                </div>
                <div>
                  <div className="post-watch-title">Delete Cache After Watching</div>
                  <div className="post-watch-desc">Clean up stream cache when done</div>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Appearance / accent */}
        <div className="settings-card" id="settings-appearance">
          <div className="card-header-row">
            <Palette size={18} className="text-purple-400" />
            <h3>Appearance</h3>
          </div>
          <p className="settings-card-hint">
            Accent color for highlights, active nav, progress bars, and focus states.
          </p>
          <div className="accent-picker-row">
            <label className="accent-swatch-input">
              <input
                type="color"
                value={formData.accentColor || "#a855f7"}
                onChange={(e) => handleChange("accentColor", e.target.value)}
                aria-label="Accent color"
              />
              <span className="accent-swatch-preview" style={{ background: formData.accentColor || "#a855f7" }} />
            </label>
            <div className="accent-picker-meta">
              <div className="post-watch-title">Accent color</div>
              <div className="post-watch-desc font-mono">{(formData.accentColor || "#a855f7").toUpperCase()}</div>
            </div>
            <input
              type="text"
              className="setting-input accent-hex-input"
              value={formData.accentColor || "#a855f7"}
              onChange={(e) => {
                const v = e.target.value.trim();
                if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) {
                  handleChange("accentColor", v);
                } else {
                  setFormData((prev) => ({ ...prev, accentColor: v }));
                }
              }}
              onBlur={() => {
                const v = (formData.accentColor || "").trim();
                if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) {
                  handleChange("accentColor", "#a855f7");
                }
              }}
              placeholder="#a855f7"
            />
          </div>
          <div className="accent-presets">
            {ACCENT_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                className={`accent-preset-btn ${
                  (formData.accentColor || "").toLowerCase() === p.value.toLowerCase() ? "is-active" : ""
                }`}
                style={{ "--preset": p.value } as React.CSSProperties}
                title={p.label}
                aria-label={p.label}
                onClick={() => handleChange("accentColor", p.value)}
              />
            ))}
          </div>
        </div>

        {/* Easy Watch */}
        <div className="settings-card" id="settings-easy-watch">
          <div className="card-header-row">
            <Zap size={18} className="text-amber-400" />
            <h3>Easy Watch</h3>
          </div>
          <p className="settings-card-hint">
            When enabled, Play / Watch Now skips the torrent list and starts the highest-ranked release automatically.
          </p>
          <div className="easy-watch-row">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={formData.easyWatch ?? true}
                onChange={(e) => handleChange("easyWatch", e.target.checked)}
              />
              <span className="toggle-slider" />
            </label>
            <div>
              <div className="post-watch-title">Auto-select best torrent</div>
              <div className="post-watch-desc">Ranks by SeaDex best, seeders, and preferred quality</div>
            </div>
          </div>
          <div className="form-grid mt-4">
            <div className="form-group">
              <label className="input-label">Preferred quality</label>
              <select
                className="setting-input"
                value={formData.preferredQuality || "1080p"}
                onChange={(e) => handleChange("preferredQuality", e.target.value as PreferredQuality)}
                disabled={!(formData.easyWatch ?? true)}
              >
                <option value="720p">720p</option>
                <option value="1080p">1080p (recommended)</option>
                <option value="2160p">4K / 2160p</option>
                <option value="any">Any (seeders first)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="input-label">Minimum seeders</label>
              <input
                type="number"
                min={0}
                max={50}
                className="setting-input"
                value={formData.minSeeders ?? 1}
                onChange={(e) => handleChange("minSeeders", parseInt(e.target.value, 10) || 0)}
                disabled={!(formData.easyWatch ?? true)}
              />
            </div>
          </div>
        </div>

        {/* Section 3: Primary Indexer Providers (Nyaa, AnimeTosho, SeaDex) */}
        <div className="settings-card" id="settings-indexers">
          <div className="card-header-row">
            <Radio size={18} className="text-emerald-400" />
            <h3>Torrent Indexer Providers</h3>
          </div>
          <div className="providers-list space-y-4">
            {/* Nyaa Provider */}
            <div className="provider-item-box">
              <div className="provider-top-row">
                <div className="provider-title-wrap">
                  <span className="provider-name">Nyaa.si</span>
                  <span className="provider-desc">Primary anime torrent search indexer</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={formData.enableNyaa}
                    onChange={(e) => handleChange("enableNyaa", e.target.checked)}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
              {formData.enableNyaa && (
                <div className="provider-config-row">
                  <label className="input-label">Nyaa Domain / Mirror URL</label>
                  <input
                    type="text"
                    value={formData.nyaaUrl}
                    onChange={(e) => handleChange("nyaaUrl", e.target.value)}
                    className="setting-input"
                  />
                </div>
              )}
            </div>

            {/* AnimeTosho Provider */}
            <div className="provider-item-box">
              <div className="provider-top-row">
                <div className="provider-title-wrap">
                  <span className="provider-name">AnimeTosho</span>
                  <span className="provider-desc">Automated torrent mirror and DDL archive service</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={formData.enableAnimeTosho}
                    onChange={(e) => handleChange("enableAnimeTosho", e.target.checked)}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
              {formData.enableAnimeTosho && (
                <div className="provider-config-row">
                  <label className="input-label">AnimeTosho Service URL</label>
                  <input
                    type="text"
                    value={formData.animeToshoUrl}
                    onChange={(e) => handleChange("animeToshoUrl", e.target.value)}
                    className="setting-input"
                  />
                </div>
              )}
            </div>

            {/* SeaDex Provider */}
            <div className="provider-item-box">
              <div className="provider-top-row">
                <div className="provider-title-wrap">
                  <span className="provider-name">SeaDex (Best Releases)</span>
                  <span className="provider-desc">Curated best encode & release group indexer</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={formData.enableSeaDex}
                    onChange={(e) => handleChange("enableSeaDex", e.target.checked)}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
              {formData.enableSeaDex && (
                <div className="provider-config-row grid-2">
                  <div>
                    <label className="input-label">SeaDex API / Service URL</label>
                    <input
                      type="text"
                      value={formData.seaDexUrl}
                      onChange={(e) => handleChange("seaDexUrl", e.target.value)}
                      className="setting-input"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-5">
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={formData.seaDexBestOnly}
                        onChange={(e) => handleChange("seaDexBestOnly", e.target.checked)}
                      />
                      <span className="toggle-slider" />
                    </label>
                    <span className="text-xs text-zinc-300">Only Show Best Releases</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section 4: Secondary Services (Jackett & Prowlarr) */}
        <div className="settings-card">
          <div className="card-header-row">
            <Cpu size={18} className="text-amber-400" />
            <h3>Custom Indexer Integrations (Jackett / Prowlarr)</h3>
          </div>
          <div className="form-grid">
            {/* Jackett */}
            <div className="form-group">
              <div className="flex items-center justify-between mb-1">
                <label className="input-label mb-0">Jackett Server URL</label>
                <label className="toggle-switch small">
                  <input
                    type="checkbox"
                    checked={formData.enableJackett}
                    onChange={(e) => handleChange("enableJackett", e.target.checked)}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
              <input
                type="text"
                value={formData.jackettUrl}
                onChange={(e) => handleChange("jackettUrl", e.target.value)}
                className="setting-input"
                disabled={!formData.enableJackett}
              />
            </div>

            <div className="form-group">
              <label className="input-label">Jackett API Key</label>
              <input
                type="password"
                placeholder="Jackett API Key"
                value={formData.jackettApiKey}
                onChange={(e) => handleChange("jackettApiKey", e.target.value)}
                className="setting-input"
                disabled={!formData.enableJackett}
              />
            </div>

            {/* Prowlarr */}
            <div className="form-group">
              <div className="flex items-center justify-between mb-1">
                <label className="input-label mb-0">Prowlarr Server URL</label>
                <label className="toggle-switch small">
                  <input
                    type="checkbox"
                    checked={formData.enableProwlarr}
                    onChange={(e) => handleChange("enableProwlarr", e.target.checked)}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
              <input
                type="text"
                value={formData.prowlarrUrl}
                onChange={(e) => handleChange("prowlarrUrl", e.target.value)}
                className="setting-input"
                disabled={!formData.enableProwlarr}
              />
            </div>

            <div className="form-group">
              <label className="input-label">Prowlarr API Key</label>
              <input
                type="password"
                placeholder="Prowlarr API Key"
                value={formData.prowlarrApiKey}
                onChange={(e) => handleChange("prowlarrApiKey", e.target.value)}
                className="setting-input"
                disabled={!formData.enableProwlarr}
              />
            </div>
          </div>
        </div>

        {/* Section 5: TMDB Metadata Key Override */}
        <div className="settings-card" id="settings-api">
          <div className="card-header-row">
            <Key size={18} className="text-rose-400" />
            <h3>Metadata APIs & External Keys</h3>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label className="input-label">TMDB API Key (Optional Override)</label>
              <input
                type="password"
                placeholder="Leave blank to use built-in TMDB key"
                value={formData.tmdbApiKey}
                onChange={(e) => handleChange("tmdbApiKey", e.target.value)}
                className="setting-input"
              />
            </div>
          </div>
        </div>

        {/* Sticky Save Bar */}
        <div className="settings-save-bar">
          <button type="submit" className="btn-primary big">
            <Save size={16} />
            <span>Save Preferences</span>
          </button>
          {savedSuccess && (
            <span className="save-success-msg text-emerald-400 text-xs flex items-center gap-1 font-semibold">
              <Check size={16} /> Preferences Saved Successfully!
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
