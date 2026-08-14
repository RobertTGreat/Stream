import React, { useState, useEffect, useRef } from "react";
import {
  Save,
  Folder,
  FolderOpen,
  Key,
  HardDrive,
  Check,
  Radio,
  Cpu,
  User,
  Sparkles,
  Zap,
  Palette,
  Activity,
  Download,
  Upload,
  CheckCircle2,
  XCircle,
  Loader2,
  Database,
} from "lucide-react";
import { AppSettings, PreferredQuality, UserProfile } from "../types";
import { ACCENT_PRESETS, applyAccentColor } from "../utils/theme";
import { selectDirectory, checkIndexerHealth, HealthCheckResult } from "../services/tauri";
import { StorageService } from "../services/storage";

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
  const [connectionTests, setConnectionTests] = useState<Record<string, { loading?: boolean; result?: HealthCheckResult }>>({});
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const handleBrowseFolder = async (field: keyof AppSettings, title: string) => {
    const current = (formData[field] as string) || "";
    const selected = await selectDirectory(title, current);
    if (selected) {
      handleChange(field, selected);
    }
  };

  const handleTestConnection = async (type: "jackett" | "prowlarr" | "tmdb") => {
    setConnectionTests((prev) => ({ ...prev, [type]: { loading: true } }));
    let url = "";
    let apiKey = "";
    if (type === "jackett") {
      url = formData.jackettUrl;
      apiKey = formData.jackettApiKey;
    } else if (type === "prowlarr") {
      url = formData.prowlarrUrl;
      apiKey = formData.prowlarrApiKey;
    } else if (type === "tmdb") {
      url = "https://api.themoviedb.org/3";
      apiKey = formData.tmdbApiKey;
    }

    const res = await checkIndexerHealth(url, apiKey, type);
    setConnectionTests((prev) => ({ ...prev, [type]: { loading: false, result: res } }));
  };

  const handleExportBackup = () => {
    try {
      const json = StorageService.exportBackupJson();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `stream-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setBackupStatus("Backup exported successfully!");
      setTimeout(() => setBackupStatus(null), 3000);
    } catch (e) {
      setBackupStatus("Failed to export backup.");
    }
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      if (!content) return;
      const res = StorageService.importBackupJson(content);
      if (res.success) {
        setBackupStatus("Backup restored! Reloading settings...");
        setTimeout(() => window.location.reload(), 1200);
      } else {
        setBackupStatus(`Import failed: ${res.error || "Invalid file"}`);
      }
    };
    reader.readAsText(file);
  };

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
              <div className="input-browse-group">
                <input
                  type="text"
                  value={formData.animeFolder}
                  onChange={(e) => handleChange("animeFolder", e.target.value)}
                  className="setting-input"
                  placeholder="C:\Media\Anime"
                />
                <button
                  type="button"
                  className="btn-secondary btn-browse"
                  onClick={() => handleBrowseFolder("animeFolder", "Select Anime Folder")}
                  title="Browse folder..."
                >
                  <FolderOpen size={14} />
                  <span>Browse</span>
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="input-label">Movies Library Folder</label>
              <div className="input-browse-group">
                <input
                  type="text"
                  value={formData.moviesFolder}
                  onChange={(e) => handleChange("moviesFolder", e.target.value)}
                  className="setting-input"
                  placeholder="C:\Media\Movies"
                />
                <button
                  type="button"
                  className="btn-secondary btn-browse"
                  onClick={() => handleBrowseFolder("moviesFolder", "Select Movies Folder")}
                  title="Browse folder..."
                >
                  <FolderOpen size={14} />
                  <span>Browse</span>
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="input-label">TV Series Library Folder</label>
              <div className="input-browse-group">
                <input
                  type="text"
                  value={formData.tvFolder}
                  onChange={(e) => handleChange("tvFolder", e.target.value)}
                  className="setting-input"
                  placeholder="C:\Media\TV Shows"
                />
                <button
                  type="button"
                  className="btn-secondary btn-browse"
                  onClick={() => handleBrowseFolder("tvFolder", "Select TV Shows Folder")}
                  title="Browse folder..."
                >
                  <FolderOpen size={14} />
                  <span>Browse</span>
                </button>
              </div>
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
              <div className="input-browse-group">
                <input
                  type="text"
                  value={formData.downloadPath}
                  onChange={(e) => handleChange("downloadPath", e.target.value)}
                  className="setting-input"
                  placeholder="C:\Downloads\Stream"
                />
                <button
                  type="button"
                  className="btn-secondary btn-browse"
                  onClick={() => handleBrowseFolder("downloadPath", "Select Download Directory")}
                  title="Browse directory..."
                >
                  <FolderOpen size={14} />
                  <span>Browse</span>
                </button>
              </div>
            </div>
            <div className="form-group">
              <label className="input-label">Max Concurrent Downloads</label>
              <input
                type="number"
                min={1}
                max={10}
                value={formData.maxConcurrentDownloads}
                onChange={(e) => handleChange("maxConcurrentDownloads", parseInt(e.target.value, 10) || 1)}
                className="setting-input"
              />
            </div>
            <div className="form-group">
              <label className="input-label">Download Speed Limit (MB/s, 0 = unlimited)</label>
              <input
                type="number"
                min={0}
                max={500}
                value={formData.speedLimitMBps || 0}
                onChange={(e) => handleChange("speedLimitMBps", parseInt(e.target.value, 10) || 0)}
                className="setting-input"
              />
            </div>
          </div>
        </div>

        {/* Section 2.5: Appearance & Theme Accents */}
        <div className="settings-card" id="settings-theme">
          <div className="card-header-row">
            <Palette size={18} className="text-purple-400" />
            <h3>Theme & Accent Color</h3>
          </div>
          <div className="theme-accents-row">
            {ACCENT_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                className={`theme-preset-btn ${formData.accentColor === preset.value ? "active" : ""}`}
                onClick={() => handleChange("accentColor", preset.value)}
                style={{ "--preset-color": preset.value } as React.CSSProperties}
              >
                <span className="preset-circle" />
                <span className="preset-label">{preset.label}</span>
              </button>
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

            <div className="provider-item-box">
              <div className="provider-top-row">
                <div className="provider-title-wrap">
                  <span className="provider-name">Torrentio</span>
                  <span className="provider-desc">Stremio catalog streams for movies, TV, and anime</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={formData.enableTorrentio ?? true}
                    onChange={(e) => handleChange("enableTorrentio", e.target.checked)}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
            </div>

            <div className="provider-item-box">
              <div className="provider-top-row">
                <div className="provider-title-wrap">
                  <span className="provider-name">SubsPlease</span>
                  <span className="provider-desc">Weekly anime encodes</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={formData.enableSubsPlease ?? true}
                    onChange={(e) => handleChange("enableSubsPlease", e.target.checked)}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
            </div>

            <div className="provider-item-box">
              <div className="provider-top-row">
                <div className="provider-title-wrap">
                  <span className="provider-name">YTS</span>
                  <span className="provider-desc">Compact movie encodes</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={formData.enableYts ?? true}
                    onChange={(e) => handleChange("enableYts", e.target.checked)}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
            </div>

            <div className="provider-item-box">
              <div className="provider-top-row">
                <div className="provider-title-wrap">
                  <span className="provider-name">EZTV</span>
                  <span className="provider-desc">TV episode torrents via IMDb</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={formData.enableEztv ?? true}
                    onChange={(e) => handleChange("enableEztv", e.target.checked)}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
            </div>

            <div className="provider-item-box">
              <div className="provider-top-row">
                <div className="provider-title-wrap">
                  <span className="provider-name">The Pirate Bay</span>
                  <span className="provider-desc">Public movie and TV search via Apibay</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={formData.enablePirateBay ?? true}
                    onChange={(e) => handleChange("enablePirateBay", e.target.checked)}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
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
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn-test-conn"
                    onClick={() => handleTestConnection("jackett")}
                    disabled={connectionTests.jackett?.loading}
                  >
                    {connectionTests.jackett?.loading ? <Loader2 size={12} className="animate-spin" /> : <Activity size={12} />}
                    <span>Test</span>
                  </button>
                  <label className="toggle-switch small">
                    <input
                      type="checkbox"
                      checked={formData.enableJackett}
                      onChange={(e) => handleChange("enableJackett", e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>
              <input
                type="text"
                value={formData.jackettUrl}
                onChange={(e) => handleChange("jackettUrl", e.target.value)}
                className="setting-input"
                disabled={!formData.enableJackett}
              />
              {connectionTests.jackett?.result && (
                <div className={`conn-status-tag ${connectionTests.jackett.result.ok ? "ok" : "err"}`}>
                  {connectionTests.jackett.result.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                  <span>{connectionTests.jackett.result.message}</span>
                </div>
              )}
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
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn-test-conn"
                    onClick={() => handleTestConnection("prowlarr")}
                    disabled={connectionTests.prowlarr?.loading}
                  >
                    {connectionTests.prowlarr?.loading ? <Loader2 size={12} className="animate-spin" /> : <Activity size={12} />}
                    <span>Test</span>
                  </button>
                  <label className="toggle-switch small">
                    <input
                      type="checkbox"
                      checked={formData.enableProwlarr}
                      onChange={(e) => handleChange("enableProwlarr", e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>
              <input
                type="text"
                value={formData.prowlarrUrl}
                onChange={(e) => handleChange("prowlarrUrl", e.target.value)}
                className="setting-input"
                disabled={!formData.enableProwlarr}
              />
              {connectionTests.prowlarr?.result && (
                <div className={`conn-status-tag ${connectionTests.prowlarr.result.ok ? "ok" : "err"}`}>
                  {connectionTests.prowlarr.result.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                  <span>{connectionTests.prowlarr.result.message}</span>
                </div>
              )}
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

        <div className="settings-card" id="settings-playback">
          <div className="card-header-row">
            <Zap size={18} className="text-sky-400" />
            <h3>Playback</h3>
          </div>
          <div className="easy-watch-row">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={formData.autoPlayNext ?? true}
                onChange={(e) => handleChange("autoPlayNext", e.target.checked)}
              />
              <span className="toggle-slider" />
            </label>
            <div>
              <div className="post-watch-title">Auto-play next episode</div>
              <div className="post-watch-desc">When a series episode ends, start the next one</div>
            </div>
          </div>
          <div className="easy-watch-row mt-4">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={formData.hardwareAcceleration ?? true}
                onChange={(e) => handleChange("hardwareAcceleration", e.target.checked)}
              />
              <span className="toggle-slider" />
            </label>
            <div>
              <div className="post-watch-title">Hardware acceleration</div>
              <div className="post-watch-desc">Use GPU decode in mpv when available</div>
            </div>
          </div>
          <div className="form-grid mt-4">
            <div className="form-group">
              <label className="input-label">Preferred subtitles</label>
              <select
                className="setting-input"
                value={formData.defaultSubtitles || "English"}
                onChange={(e) => handleChange("defaultSubtitles", e.target.value)}
              >
                <option value="English">English</option>
                <option value="Japanese">Japanese</option>
                <option value="Spanish">Spanish</option>
                <option value="French">French</option>
                <option value="German">German</option>
              </select>
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
              <div className="flex items-center justify-between mb-1">
                <label className="input-label mb-0">TMDB API Key (Optional Override)</label>
                <button
                  type="button"
                  className="btn-test-conn"
                  onClick={() => handleTestConnection("tmdb")}
                  disabled={connectionTests.tmdb?.loading}
                >
                  {connectionTests.tmdb?.loading ? <Loader2 size={12} className="animate-spin" /> : <Activity size={12} />}
                  <span>Test API</span>
                </button>
              </div>
              <input
                type="password"
                placeholder="Leave blank to use built-in TMDB key"
                value={formData.tmdbApiKey}
                onChange={(e) => handleChange("tmdbApiKey", e.target.value)}
                className="setting-input"
              />
              {connectionTests.tmdb?.result && (
                <div className={`conn-status-tag ${connectionTests.tmdb.result.ok ? "ok" : "err"}`}>
                  {connectionTests.tmdb.result.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                  <span>{connectionTests.tmdb.result.message}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section 6: Backup & Data Management */}
        <div className="settings-card" id="settings-backup">
          <div className="card-header-row">
            <Database size={18} className="text-purple-400" />
            <h3>Data Management & Backups</h3>
          </div>
          <p className="settings-card-hint">
            Export your watch history, watchlist, favorites, custom collections, and settings to a JSON file, or restore a previous backup.
          </p>
          <div className="backup-actions-row flex items-center gap-3 mt-3">
            <button
              type="button"
              className="btn-secondary"
              onClick={handleExportBackup}
            >
              <Download size={14} />
              <span>Export Backup JSON</span>
            </button>

            <button
              type="button"
              className="btn-secondary"
              onClick={() => importInputRef.current?.click()}
            >
              <Upload size={14} />
              <span>Import Backup JSON</span>
            </button>

            <input
              ref={importInputRef}
              type="file"
              accept=".json"
              className="hidden"
              style={{ display: "none" }}
              onChange={handleImportBackup}
            />

            {backupStatus && (
              <span className="text-xs font-semibold text-purple-300 ml-2">
                {backupStatus}
              </span>
            )}
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
