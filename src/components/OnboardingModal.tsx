import { useState } from "react";
import {
  HardDrive,
  Trash2,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Zap,
  ListVideo,
  MonitorPlay,
} from "lucide-react";
import { AppSettings, PreferredQuality } from "../types";

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (settings: AppSettings) => void;
}

type Step = 0 | 1 | 2;

const QUALITY_OPTIONS: { value: PreferredQuality; label: string; desc: string }[] = [
  { value: "720p", label: "720p", desc: "Faster start, lower bandwidth" },
  { value: "1080p", label: "1080p", desc: "Best balance (recommended)" },
  { value: "2160p", label: "4K / 2160p", desc: "Highest quality when available" },
  { value: "any", label: "Any", desc: "Pick by seeders only" },
];

export function OnboardingModal({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
}: OnboardingModalProps) {
  const [step, setStep] = useState<Step>(0);
  const [easyWatch, setEasyWatch] = useState(settings.easyWatch ?? true);
  const [preferredQuality, setPreferredQuality] = useState<PreferredQuality>(
    settings.preferredQuality || "1080p"
  );
  const [selectedBehavior, setSelectedBehavior] = useState<"keep" | "delete">(
    settings.postWatchBehavior || "keep"
  );

  if (!isOpen) return null;

  const handleComplete = () => {
    onSaveSettings({
      ...settings,
      easyWatch,
      preferredQuality,
      minSeeders: settings.minSeeders ?? 1,
      postWatchBehavior: selectedBehavior,
    });
    localStorage.setItem("stream_onboarding_completed", "true");
    onClose();
  };

  const goNext = () => {
    if (step < 2) setStep((s) => (s + 1) as Step);
    else handleComplete();
  };

  const goBack = () => {
    if (step > 0) setStep((s) => (s - 1) as Step);
  };

  return (
    <div className="onboarding-modal-backdrop">
      <div className="onboarding-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="onboarding-header">
          <div className="sparkle-icon-circle">
            <Sparkles size={24} />
          </div>
          <h2 className="onboarding-title">Welcome to Stream</h2>
          <p className="onboarding-subtitle">
            {step === 0 && "How do you want to start watching?"}
            {step === 1 && "Preferred stream quality for auto-pick."}
            {step === 2 && "What happens to files after you finish watching?"}
          </p>
          <div className="onboarding-steps" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} className={`onboarding-step-dot ${step === i ? "active" : step > i ? "done" : ""}`} />
            ))}
          </div>
        </div>

        {step === 0 && (
          <div className="onboarding-choices-grid">
            <div
              className={`onboarding-choice-box ${easyWatch ? "active" : ""}`}
              onClick={() => setEasyWatch(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setEasyWatch(true)}
            >
              <div className="choice-top-row">
                <div className="choice-icon-wrap keep">
                  <Zap size={22} />
                </div>
                {easyWatch && <CheckCircle2 size={20} className="choice-check" />}
              </div>
              <h4 className="choice-label">Easy Watch</h4>
              <p className="choice-desc">
                One click to play. Stream automatically picks the best torrent by quality, seeders,
                and trusted sources (SeaDex).
              </p>
              <span className="choice-badge">Recommended</span>
            </div>

            <div
              className={`onboarding-choice-box ${!easyWatch ? "active" : ""}`}
              onClick={() => setEasyWatch(false)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setEasyWatch(false)}
            >
              <div className="choice-top-row">
                <div className="choice-icon-wrap pick">
                  <ListVideo size={22} />
                </div>
                {!easyWatch && <CheckCircle2 size={20} className="choice-check" />}
              </div>
              <h4 className="choice-label">Pick Manually</h4>
              <p className="choice-desc">
                Always open the torrent list so you can choose resolution, release group, and source
                yourself.
              </p>
              <span className="choice-badge alt">Power users</span>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="onboarding-quality-grid">
            {QUALITY_OPTIONS.map((opt) => (
              <div
                key={opt.value}
                className={`onboarding-choice-box quality-option ${preferredQuality === opt.value ? "active" : ""}`}
                onClick={() => setPreferredQuality(opt.value)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && setPreferredQuality(opt.value)}
              >
                <div className="choice-top-row">
                  <div className="choice-icon-wrap quality">
                    <MonitorPlay size={20} />
                  </div>
                  {preferredQuality === opt.value && (
                    <CheckCircle2 size={18} className="choice-check" />
                  )}
                </div>
                <h4 className="choice-label">{opt.label}</h4>
                <p className="choice-desc">{opt.desc}</p>
              </div>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="onboarding-choices-grid">
            <div
              className={`onboarding-choice-box ${selectedBehavior === "keep" ? "active" : ""}`}
              onClick={() => setSelectedBehavior("keep")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setSelectedBehavior("keep")}
            >
              <div className="choice-top-row">
                <div className="choice-icon-wrap keep">
                  <HardDrive size={22} />
                </div>
                {selectedBehavior === "keep" && (
                  <CheckCircle2 size={20} className="choice-check" />
                )}
              </div>
              <h4 className="choice-label">Keep After Watching</h4>
              <p className="choice-desc">
                Preserve downloaded episode and movie files in your media library directory.
              </p>
              <span className="choice-badge">Collectors</span>
            </div>

            <div
              className={`onboarding-choice-box ${selectedBehavior === "delete" ? "active" : ""}`}
              onClick={() => setSelectedBehavior("delete")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setSelectedBehavior("delete")}
            >
              <div className="choice-top-row">
                <div className="choice-icon-wrap delete">
                  <Trash2 size={22} />
                </div>
                {selectedBehavior === "delete" && (
                  <CheckCircle2 size={20} className="choice-check" />
                )}
              </div>
              <h4 className="choice-label">Delete After Watching</h4>
              <p className="choice-desc">
                Clean up stream cache and downloaded files after finishing to save disk space.
              </p>
              <span className="choice-badge alt">Storage saving</span>
            </div>
          </div>
        )}

        <div className="onboarding-footer">
          {step > 0 ? (
            <button type="button" onClick={goBack} className="onboarding-back-btn">
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>
          ) : (
            <button type="button" onClick={handleComplete} className="onboarding-skip-btn">
              Skip setup
            </button>
          )}
          <button type="button" onClick={goNext} className="onboarding-complete-btn">
            <span>{step === 2 ? "Start Streaming" : "Continue"}</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
