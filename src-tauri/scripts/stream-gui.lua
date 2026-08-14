-- Stream Desktop Custom On-Screen Controller (OSC / GUI) for MPV
-- Sleek Minimal Dark Mode with Volume Slider Bar & Track Popouts

local assdraw = require("mp.assdraw")

local overlay = nil
if mp.create_osd_overlay then
  pcall(function()
    overlay = mp.create_osd_overlay("ass-events")
  end)
end

-- State Variables
local visible = true
local hide_timer = nil
local dragging_timeline = false
local dragging_volume = false
local active_popup = nil -- nil, "sub", or "audio"
local skip_target = nil
local skip_label = nil
local hover_ratio = nil
local hover_btn_id = nil
local osd_msg_text = nil
local osd_msg_timer = nil
local registered_intervals = {}

-- Interactive Hitboxes (repopulated on render)
local buttons = {}
local timeline_hitbox = nil
local volume_hitbox = nil
local skip_hitbox = nil
local popup_hitbox = nil

local function get_timeline_markers(dur)
  local markers = {}
  if not dur or dur <= 0 then return markers end

  -- 1. Add registered AniSkip intervals
  for _, interval in ipairs(registered_intervals) do
    if interval.start_t and interval.end_t and interval.start_t < dur then
      table.insert(markers, {
        start_t = math.max(0, interval.start_t),
        end_t = math.min(dur, interval.end_t),
        label = interval.label or "Intro",
        skip_type = interval.skip_type or "op",
        is_intro = true,
      })
    end
  end

  -- 2. Add native MPV chapters
  local chapters = mp.get_property_native("chapter-list") or {}
  for i, ch in ipairs(chapters) do
    local ch_start = ch.time or 0
    local next_ch = chapters[i + 1]
    local ch_end = next_ch and (next_ch.time or dur) or dur
    local ch_title = ch.title or string.format("Chapter %d", i)
    local lower_title = string.lower(ch_title)
    local is_intro = lower_title:find("intro") or lower_title:find("opening") or lower_title:find("^op") or lower_title:find("ending") or lower_title:find("^ed") or lower_title:find("recap")

    local overlaps = false
    for _, m in ipairs(markers) do
      if math.abs(m.start_t - ch_start) < 4 then
        overlaps = true
        break
      end
    end

    if not overlaps and ch_start < dur then
      table.insert(markers, {
        start_t = math.max(0, ch_start),
        end_t = math.min(dur, ch_end),
        label = ch_title,
        is_intro = is_intro,
        is_chapter = true,
      })
    end
  end

  return markers
end

local function format_time(seconds)
  seconds = math.max(0, math.floor(seconds or 0))
  local h = math.floor(seconds / 3600)
  local m = math.floor((seconds % 3600) / 60)
  local s = seconds % 60
  if h > 0 then
    return string.format("%d:%02d:%02d", h, m, s)
  end
  return string.format("%02d:%02d", m, s)
end

local function show_osd_toast(text)
  osd_msg_text = text
  if osd_msg_timer then
    osd_msg_timer:kill()
  end
  osd_msg_timer = mp.add_timeout(1.8, function()
    osd_msg_text = nil
    if visible then
      render()
    end
  end)
  show()
end

local function hide_later()
  if hide_timer then
    hide_timer:kill()
  end
  hide_timer = mp.add_timeout(3.0, function()
    local paused = mp.get_property_bool("pause", false)
    if not dragging_timeline and not dragging_volume and not paused and not active_popup then
      visible = false
      hover_ratio = nil
      hover_btn_id = nil
      render()
    end
  end)
end

function show()
  visible = true
  render()
  hide_later()
end

local function seek_to_ratio(ratio)
  local dur = mp.get_property_number("duration", 0)
  if dur > 0 then
    ratio = math.max(0, math.min(1, ratio))
    mp.commandv("seek", ratio * dur, "absolute+keyframes")
  end
end

local function set_volume_ratio(ratio)
  ratio = math.max(0, math.min(1, ratio))
  local vol = math.floor(ratio * 100)
  mp.set_property_number("volume", vol)
  if mp.get_property_bool("mute", false) and vol > 0 then
    mp.set_property_bool("mute", false)
  end
  show_osd_toast(string.format("Volume: %d%%", vol))
end

local function adjust_volume(delta)
  local cur = mp.get_property_number("volume", 100)
  local new_vol = math.max(0, math.min(100, cur + delta))
  mp.set_property_number("volume", new_vol)
  if mp.get_property_bool("mute", false) and new_vol > 0 then
    mp.set_property_bool("mute", false)
  end
  show_osd_toast(string.format("Volume: %d%%", math.floor(new_vol)))
end

local function get_track_label(track_type)
  local tracks = mp.get_property_native("track-list") or {}
  for _, track in ipairs(tracks) do
    if track.type == track_type and track.selected then
      local label = track.title or track.lang or (track_type == "sub" and "Sub " .. tostring(track.id) or "Audio " .. tostring(track.id))
      label = tostring(label)
      if #label > 10 then
        label = label:sub(1, 8) .. ".."
      end
      return label
    end
  end
  if track_type == "sub" then
    local sid = mp.get_property("sid")
    if sid == "no" or sid == "false" or not sid or sid == "0" then
      return "Off"
    end
  end
  return track_type == "sub" and "Sub" or "Audio"
end

local function cycle_speed()
  local speeds = { 0.5, 0.75, 1.0, 1.25, 1.5, 2.0 }
  local cur = mp.get_property_number("speed", 1.0)
  local next_speed = 1.0
  for i, s in ipairs(speeds) do
    if math.abs(s - cur) < 0.08 then
      next_speed = speeds[(i % #speeds) + 1]
      break
    end
  end
  mp.set_property_number("speed", next_speed)
  show_osd_toast(string.format("Speed: %.2fx", next_speed))
end

function render()
  local dims = mp.get_property_native("osd-dimensions")
  local osd_w = dims and dims.w or 0
  local osd_h = dims and dims.h or 0
  if not osd_w or osd_w < 50 or not osd_h or osd_h < 50 then
    osd_w, osd_h = mp.get_osd_size()
  end
  if not osd_w or osd_w < 50 or not osd_h or osd_h < 50 then
    return
  end

  if not visible then
    buttons = {}
    timeline_hitbox = nil
    volume_hitbox = nil
    skip_hitbox = nil
    popup_hitbox = nil
    if overlay then
      overlay.data = ""
      overlay:update()
    else
      mp.set_osd_ass(osd_w, osd_h, "")
    end
    return
  end

  local pos = mp.get_property_number("time-pos", 0) or 0
  local dur = mp.get_property_number("duration", 0) or 0
  local paused = mp.get_property_bool("pause", false)
  local vol = mp.get_property_number("volume", 100) or 100
  local muted = mp.get_property_bool("mute", false)
  local speed = mp.get_property_number("speed", 1.0) or 1.0
  local title = mp.get_property("media-title") or mp.get_property("filename") or "Stream Playback"
  local sub_label = get_track_label("sub")
  local audio_label = get_track_label("audio")

  local markers = get_timeline_markers(dur)

  -- Check if pos is currently inside any intro interval to show Skip button
  local current_intro = nil
  for _, m in ipairs(markers) do
    if m.is_intro and pos >= m.start_t and pos < m.end_t then
      current_intro = m
      break
    end
  end

  if current_intro then
    skip_target = current_intro.end_t
    skip_label = current_intro.label
  elseif skip_target and pos >= skip_target then
    skip_target = nil
    skip_label = nil
  end

  local pct = 0
  if dur > 0 then
    pct = math.max(0, math.min(1, pos / dur))
  end

  local ass = assdraw.ass_new()
  ass.scale = 1
  buttons = {}

  -- 1. TOP HEADER BAR (Minimal Dark Gradient)
  local top_h = 44
  ass:append("{\\an7\\pos(0,0)\\bord0\\shad0\\1c&H080808&\\1a&H28&}")
  ass:draw_start()
  ass:rect_cw(0, 0, osd_w, top_h)
  ass:draw_stop()

  -- Top Border Accent Line
  ass:append("\n{\\an7\\pos(0,0)\\bord0\\shad0\\1c&H222222&\\1a&H60&}")
  ass:draw_start()
  ass:rect_cw(0, top_h - 1, osd_w, top_h)
  ass:draw_stop()

  -- Top Title Text
  local safe_title = title:gsub('["\\{}]', "")
  if #safe_title > 65 then
    safe_title = safe_title:sub(1, 62) .. "..."
  end
  ass:append(string.format(
    "\n{\\an4\\pos(24,%d)\\fs14\\b1\\bord0\\shad0\\1c&H888888&}● {\\1c&HE5E5E5&}%s",
    math.floor(top_h / 2),
    safe_title
  ))

  -- 2. FLOATING OSD TOAST NOTIFICATION (Top Center)
  if osd_msg_text then
    local toast_w = 170
    local toast_h = 32
    local toast_x = math.floor((osd_w - toast_w) / 2)
    local toast_y = top_h + 16

    ass:append("\n{\\an7\\pos(0,0)\\bord1\\3c&H444444&\\1c&H111111&\\1a&H18&}")
    ass:draw_start()
    ass:round_rect_cw(toast_x, toast_y, toast_x + toast_w, toast_y + toast_h, 4)
    ass:draw_stop()

    ass:append(string.format(
      "\n{\\an5\\pos(%d,%d)\\fs13\\b1\\bord0\\shad0\\1c&HFFFFFF&}%s",
      math.floor(osd_w / 2),
      toast_y + math.floor(toast_h / 2),
      osd_msg_text
    ))
  end

  -- 3. SKIP INTRO / OUTRO FLOATING BUTTON
  if skip_target and pos < skip_target then
    local skip_w = 148
    local skip_h = 34
    local skip_x = osd_w - skip_w - 24
    local skip_y = osd_h - 146
    local is_hover = (hover_btn_id == "skip_btn")

    skip_hitbox = { x1 = skip_x, y1 = skip_y, x2 = skip_x + skip_w, y2 = skip_y + skip_h }

    local border_col = is_hover and "&H777777&" or "&H444444&"
    local fill_col = is_hover and "&H282828&" or "&H181818&"
    ass:append(string.format("\n{\\an7\\pos(0,0)\\bord1\\3c%s\\1c%s\\1a&H14&}", border_col, fill_col))
    ass:draw_start()
    ass:round_rect_cw(skip_x, skip_y, skip_x + skip_w, skip_y + skip_h, 4)
    ass:draw_stop()

    ass:append(string.format(
      "\n{\\an5\\pos(%d,%d)\\fs13\\b1\\bord0\\shad0\\1c&HFFFFFF&}▶▶ %s {\\1c&H888888&\\fs10}(S)",
      skip_x + math.floor(skip_w / 2),
      skip_y + math.floor(skip_h / 2),
      skip_label or "Skip Intro"
    ))
  else
    skip_hitbox = nil
  end

  -- 4. BOTTOM FLOATING CONTROLLER CARD (Neutral Dark Glass)
  local bar_h = 84
  local card_m = 24
  local card_x = card_m
  local card_w = osd_w - (card_m * 2)
  local card_y = osd_h - bar_h - 20

  -- Card Dark Background
  ass:append("\n{\\an7\\pos(0,0)\\bord1\\3c&H2C2C2C&\\1c&H101010&\\1a&H18&}")
  ass:draw_start()
  ass:round_rect_cw(card_x, card_y, card_x + card_w, card_y + bar_h, 6)
  ass:draw_stop()

  -- 5. TIMELINE SCRUBBER
  local seek_x = card_x + 18
  local seek_w = card_w - 36
  local seek_y = card_y + 14
  local bar_th = 6

  timeline_hitbox = {
    x1 = seek_x - 4,
    y1 = seek_y - 8,
    x2 = seek_x + seek_w + 4,
    y2 = seek_y + bar_th + 8,
  }

  -- Seekbar Track Background (Muted Dark)
  ass:append("\n{\\an7\\pos(0,0)\\bord0\\shad0\\1c&H2E2E2E&\\1a&H00&}")
  ass:draw_start()
  ass:round_rect_cw(seek_x, seek_y, seek_x + seek_w, seek_y + bar_th, 2)
  ass:draw_stop()

  -- Intro / Chapter Highlight Segments on the Track
  if dur > 0 then
    for _, m in ipairs(markers) do
      if m.is_intro and m.end_t > m.start_t then
        local m_x1 = seek_x + math.floor((m.start_t / dur) * seek_w)
        local m_x2 = seek_x + math.floor((m.end_t / dur) * seek_w)
        if m_x2 > m_x1 + 1 then
          ass:append("\n{\\an7\\pos(0,0)\\bord1\\3c&H5A5A5A&\\1c&H444444&\\1a&H00&}")
          ass:draw_start()
          ass:round_rect_cw(m_x1, seek_y, m_x2, seek_y + bar_th, 1)
          ass:draw_stop()
        end
      end
    end
  end

  -- Chapter / Intro Boundary Dividers (Notches)
  if dur > 0 then
    for _, m in ipairs(markers) do
      if m.start_t > 1 and m.start_t < dur - 1 then
        local notch_x = seek_x + math.floor((m.start_t / dur) * seek_w)
        ass:append("\n{\\an7\\pos(0,0)\\bord0\\shad0\\1c&H141414&\\1a&H00&}")
        ass:draw_start()
        ass:rect_cw(notch_x - 1, seek_y, notch_x + 1, seek_y + bar_th)
        ass:draw_stop()
      end
    end
  end

  -- Seekbar Filled Progress (Clean White)
  if pct > 0 then
    local fill_w = math.max(4, math.floor(seek_w * pct))
    ass:append("\n{\\an7\\pos(0,0)\\bord0\\shad0\\1c&HFFFFFF&\\1a&H00&}")
    ass:draw_start()
    ass:round_rect_cw(seek_x, seek_y, seek_x + fill_w, seek_y + bar_th, 2)
    ass:draw_stop()

    -- Redraw chapter notch dividers on the filled portion so splits remain visible
    if dur > 0 then
      for _, m in ipairs(markers) do
        if m.start_t > 1 then
          local notch_x = seek_x + math.floor((m.start_t / dur) * seek_w)
          if notch_x < seek_x + fill_w - 2 then
            ass:append("\n{\\an7\\pos(0,0)\\bord0\\shad0\\1c&H141414&\\1a&H00&}")
            ass:draw_start()
            ass:rect_cw(notch_x - 1, seek_y, notch_x + 1, seek_y + bar_th)
            ass:draw_stop()
          end
        end
      end
    end

    -- Scrubber Thumb
    local thumb_x = seek_x + fill_w
    local thumb_y = seek_y + 3
    local thumb_r = (dragging_timeline or hover_ratio) and 6 or 4
    ass:append("\n{\\an7\\pos(0,0)\\bord2\\3c&H111111&\\1c&HFFFFFF&\\1a&H00&}")
    ass:draw_start()
    ass:round_rect_cw(thumb_x - thumb_r, thumb_y - thumb_r, thumb_x + thumb_r, thumb_y + thumb_r, 3)
    ass:draw_stop()
  end

  -- Scrubber Hover Time + Chapter Tooltip
  if hover_ratio and dur > 0 then
    local hover_pos = hover_ratio * dur
    local active_marker = nil
    for _, m in ipairs(markers) do
      if hover_pos >= m.start_t and hover_pos <= m.end_t then
        active_marker = m
        break
      end
    end

    local time_text = format_time(hover_pos)
    local tip_text = time_text
    local tip_w = 64
    if active_marker and active_marker.label and #active_marker.label > 0 then
      local label_str = active_marker.label:gsub('["\\{}]', "")
      if #label_str > 18 then
        label_str = label_str:sub(1, 16) .. ".."
      end
      tip_text = string.format("%s · %s", time_text, label_str)
      tip_w = math.max(64, 36 + (#tip_text * 7))
    end

    local h_x = seek_x + math.floor(seek_w * hover_ratio)
    local tip_h = 22
    local tip_x = math.max(seek_x, math.min(seek_x + seek_w - tip_w, h_x - math.floor(tip_w / 2)))
    local tip_y = seek_y - 28

    ass:append("\n{\\an7\\pos(0,0)\\bord1\\3c&H444444&\\1c&H181818&\\1a&H08&}")
    ass:draw_start()
    ass:round_rect_cw(tip_x, tip_y, tip_x + tip_w, tip_y + tip_h, 3)
    ass:draw_stop()

    ass:append(string.format(
      "\n{\\an5\\pos(%d,%d)\\fs11\\b1\\bord0\\shad0\\1c&HFFFFFF&}%s",
      tip_x + math.floor(tip_w / 2),
      tip_y + math.floor(tip_h / 2),
      tip_text
    ))
  end

  -- 6. CONTROLS ROW (Buttons + Interactive Volume Slider Bar)
  local row_y = card_y + 36
  local btn_h = 32

  -- Helper to draw clean neutral dark buttons
  local function draw_button(id, x, y, w, h, text, is_active, callback)
    table.insert(buttons, { id = id, x1 = x, y1 = y, x2 = x + w, y2 = y + h, callback = callback })
    local is_hover = (hover_btn_id == id)
    local bg_col = is_active and "&H303030&" or (is_hover and "&H282828&" or "&H1A1A1A&")
    local border_col = is_active and "&H666666&" or (is_hover and "&H505050&" or "&H303030&")
    local text_col = (is_active or is_hover) and "&HFFFFFF&" or "&HD4D4D4&"

    ass:append(string.format("\n{\\an7\\pos(0,0)\\bord1\\3c%s\\1c%s\\1a&H18&}", border_col, bg_col))
    ass:draw_start()
    ass:round_rect_cw(x, y, x + w, y + h, 3)
    ass:draw_stop()

    ass:append(string.format(
      "\n{\\an5\\pos(%d,%d)\\fs12\\b1\\bord0\\shad0\\1c%s&}%s",
      x + math.floor(w / 2),
      y + math.floor(h / 2),
      text_col,
      text
    ))
  end

  -- Left side buttons:
  local cur_x = seek_x

  -- [ Play / Pause ]
  local play_text = paused and "▶ Play" or "❚❚ Pause"
  local play_w = 72
  draw_button("play_pause", cur_x, row_y, play_w, btn_h, play_text, true, function()
    mp.command("cycle pause")
  end)
  cur_x = cur_x + play_w + 8

  -- [ -10s ]
  local back_w = 48
  draw_button("seek_back", cur_x, row_y, back_w, btn_h, "-10s", false, function()
    mp.commandv("seek", -10, "relative")
  end)
  cur_x = cur_x + back_w + 6

  -- [ +10s ]
  local fwd_w = 48
  draw_button("seek_fwd", cur_x, row_y, fwd_w, btn_h, "+10s", false, function()
    mp.commandv("seek", 10, "relative")
  end)
  cur_x = cur_x + fwd_w + 12

  -- [ Volume Section: Speaker Icon Button + Interactive Volume Bar ]
  local vol_icon_w = 32
  local vol_icon_str = (muted or vol == 0) and "🔇" or "🔊"
  draw_button("volume_mute", cur_x, row_y, vol_icon_w, btn_h, vol_icon_str, false, function()
    mp.command("cycle mute")
  end)
  cur_x = cur_x + vol_icon_w + 8

  -- Volume Bar Slider
  local vol_bar_w = 68
  local vol_bar_h = 5
  local vol_bar_x = cur_x
  local vol_bar_y = row_y + math.floor((btn_h - vol_bar_h) / 2)

  volume_hitbox = {
    x1 = vol_bar_x - 4,
    y1 = row_y + 2,
    x2 = vol_bar_x + vol_bar_w + 4,
    y2 = row_y + btn_h - 2,
  }

  -- Vol Bar Background Track
  ass:append("\n{\\an7\\pos(0,0)\\bord0\\shad0\\1c&H2E2E2E&\\1a&H00&}")
  ass:draw_start()
  ass:round_rect_cw(vol_bar_x, vol_bar_y, vol_bar_x + vol_bar_w, vol_bar_y + vol_bar_h, 2)
  ass:draw_stop()

  -- Vol Bar Filled (0 if muted)
  local effective_vol = muted and 0 or vol
  local vol_pct = math.max(0, math.min(1, effective_vol / 100))
  local vol_fill_w = math.floor(vol_bar_w * vol_pct)
  if vol_fill_w > 0 then
    ass:append("\n{\\an7\\pos(0,0)\\bord0\\shad0\\1c&HFFFFFF&\\1a&H00&}")
    ass:draw_start()
    ass:round_rect_cw(vol_bar_x, vol_bar_y, vol_bar_x + vol_fill_w, vol_bar_y + vol_bar_h, 2)
    ass:draw_stop()
  end

  -- Vol Bar Thumb
  local vol_thumb_x = vol_bar_x + vol_fill_w
  local vol_thumb_y = vol_bar_y + 2
  local vol_thumb_r = (dragging_volume or hover_btn_id == "vol_bar") and 5 or 4
  ass:append("\n{\\an7\\pos(0,0)\\bord1\\3c&H111111&\\1c&HFFFFFF&\\1a&H00&}")
  ass:draw_start()
  ass:round_rect_cw(vol_thumb_x - vol_thumb_r, vol_thumb_y - vol_thumb_r, vol_thumb_x + vol_thumb_r, vol_thumb_y + vol_thumb_r, 2)
  ass:draw_stop()

  cur_x = cur_x + vol_bar_w + 16

  -- Time Text Display
  local time_str = string.format("%s / %s", format_time(pos), format_time(dur))
  ass:append(string.format(
    "\n{\\an4\\pos(%d,%d)\\fs12\\b1\\bord0\\shad0\\1c&H999999&}%s",
    cur_x,
    row_y + math.floor(btn_h / 2),
    time_str
  ))

  -- Right side buttons (anchored from right edge):
  local right_x = seek_x + seek_w

  -- [ Fullscreen ]
  local fs_w = 34
  right_x = right_x - fs_w
  draw_button("fullscreen", right_x, row_y, fs_w, btn_h, "⛶", false, function()
    mp.command("cycle fullscreen")
  end)
  right_x = right_x - 8

  -- [ Audio Track Popout Button ]
  local audio_w = 88
  right_x = right_x - audio_w
  local audio_btn_x = right_x
  draw_button("audio", right_x, row_y, audio_w, btn_h, "🎧 " .. audio_label, active_popup == "audio", function()
    if active_popup == "audio" then
      active_popup = nil
    else
      active_popup = "audio"
    end
    show()
  end)
  right_x = right_x - 8

  -- [ Subtitle Track Popout Button ]
  local sub_w = 88
  right_x = right_x - sub_w
  local sub_btn_x = right_x
  draw_button("sub", right_x, row_y, sub_w, btn_h, "💬 " .. sub_label, active_popup == "sub", function()
    if active_popup == "sub" then
      active_popup = nil
    else
      active_popup = "sub"
    end
    show()
  end)
  right_x = right_x - 8

  -- [ Speed ]
  local speed_w = 64
  local speed_text = string.format("%.2fx", speed)
  right_x = right_x - speed_w
  draw_button("speed", right_x, row_y, speed_w, btn_h, "⚡ " .. speed_text, false, function()
    cycle_speed()
  end)

  -- 7. FLOATING POPOUT MENUS (Subtitles & Audio)
  popup_hitbox = nil
  if active_popup == "sub" or active_popup == "audio" then
    local tracks = mp.get_property_native("track-list") or {}
    local menu_items = {}

    if active_popup == "sub" then
      local has_selected_sub = false
      for _, t in ipairs(tracks) do
        if t.type == "sub" and t.selected then
          has_selected_sub = true
          break
        end
      end
      local sid = mp.get_property("sid")
      local is_off = not has_selected_sub and (sid == "no" or sid == "false" or not sid or sid == "0")
      table.insert(menu_items, {
        id = 0,
        label = "Off",
        selected = is_off,
        on_select = function()
          mp.set_property("sid", "no")
          active_popup = nil
          show_osd_toast("Subtitle: Off")
          show()
        end
      })
      for _, t in ipairs(tracks) do
        if t.type == "sub" then
          local label = t.title or t.lang or ("Sub " .. tostring(t.id))
          table.insert(menu_items, {
            id = t.id,
            label = label,
            selected = t.selected,
            on_select = function()
              mp.set_property("sid", t.id)
              active_popup = nil
              show_osd_toast("Subtitle: " .. label)
              show()
            end
          })
        end
      end
    else
      for _, t in ipairs(tracks) do
        if t.type == "audio" then
          local label = t.title or t.lang or ("Audio " .. tostring(t.id))
          table.insert(menu_items, {
            id = t.id,
            label = label,
            selected = t.selected,
            on_select = function()
              mp.set_property("aid", t.id)
              active_popup = nil
              show_osd_toast("Audio: " .. label)
              show()
            end
          })
        end
      end
    end

    if #menu_items > 0 then
      local item_h = 32
      local pop_w = 210
      local pop_h = (#menu_items * item_h) + 12
      local anchor_x = (active_popup == "sub") and sub_btn_x or audio_btn_x
      local pop_x = math.max(card_x, math.min(card_x + card_w - pop_w, anchor_x - math.floor((pop_w - sub_w) / 2)))
      local pop_y = card_y - pop_h - 10

      popup_hitbox = { x1 = pop_x, y1 = pop_y, x2 = pop_x + pop_w, y2 = pop_y + pop_h }

      -- Popout Card Background
      ass:append("\n{\\an7\\pos(0,0)\\bord1\\3c&H383838&\\1c&H141414&\\1a&H0C&}")
      ass:draw_start()
      ass:round_rect_cw(pop_x, pop_y, pop_x + pop_w, pop_y + pop_h, 4)
      ass:draw_stop()

      -- Render Menu Items
      for idx, item in ipairs(menu_items) do
        local it_y = pop_y + 6 + ((idx - 1) * item_h)
        local btn_item_id = string.format("pop_%s_%s", active_popup, tostring(item.id))
        table.insert(buttons, {
          id = btn_item_id,
          x1 = pop_x + 4,
          y1 = it_y,
          x2 = pop_x + pop_w - 4,
          y2 = it_y + item_h,
          callback = item.on_select
        })

        local is_hover = (hover_btn_id == btn_item_id)
        if item.selected or is_hover then
          local it_bg = item.selected and (is_hover and "&H323232&" or "&H282828&") or "&H222222&"
          local it_border = item.selected and "&H555555&" or "&H3A3A3A&"
          ass:append(string.format("\n{\\an7\\pos(0,0)\\bord1\\3c%s\\1c%s\\1a&H18&}", it_border, it_bg))
          ass:draw_start()
          ass:round_rect_cw(pop_x + 6, it_y + 2, pop_x + pop_w - 6, it_y + item_h - 2, 3)
          ass:draw_stop()
        end

        local check_mark = item.selected and "✓  " or "    "
        local safe_label = item.label:gsub('["\\{}]', "")
        if #safe_label > 20 then
          safe_label = safe_label:sub(1, 18) .. ".."
        end
        local label_col = item.selected and "&HFFFFFF&" or (is_hover and "&HFFFFFF&" or "&HB0B0B0&")

        ass:append(string.format(
          "\n{\\an4\\pos(%d,%d)\\fs12\\b1\\bord0\\shad0\\1c%s&}%s%s",
          pop_x + 14,
          it_y + math.floor(item_h / 2),
          label_col,
          check_mark,
          safe_label
        ))
      end
    end
  end

  -- Send ASS buffer to MPV overlay
  if overlay then
    overlay.res_x = osd_w
    overlay.res_y = osd_h
    overlay.data = ass.text
    overlay:update()
  else
    mp.set_osd_ass(osd_w, osd_h, ass.text)
  end
end

local function handle_mouse_click(event)
  if event and event.event == "up" then
    dragging_timeline = false
    dragging_volume = false
    return
  end

  local mouse = mp.get_property_native("mouse-pos")
  if not mouse then return end

  -- 1. Check Skip Intro Click
  if skip_hitbox and mouse.x >= skip_hitbox.x1 and mouse.x <= skip_hitbox.x2 and mouse.y >= skip_hitbox.y1 and mouse.y <= skip_hitbox.y2 then
    if skip_target then
      mp.commandv("seek", skip_target, "absolute")
      skip_target = nil
      skip_label = nil
    end
    show()
    return
  end

  -- 2. Check Timeline Scrubber Click & Drag
  if timeline_hitbox and mouse.x >= timeline_hitbox.x1 and mouse.x <= timeline_hitbox.x2 and mouse.y >= timeline_hitbox.y1 and mouse.y <= timeline_hitbox.y2 then
    if active_popup then
      active_popup = nil
    end
    dragging_timeline = true
    local seek_x = timeline_hitbox.x1 + 4
    local seek_w = (timeline_hitbox.x2 - timeline_hitbox.x1) - 8
    if seek_w > 0 then
      local ratio = (mouse.x - seek_x) / seek_w
      seek_to_ratio(ratio)
    end
    show()
    return
  end

  -- 3. Check Volume Bar Click & Drag
  if volume_hitbox and mouse.x >= volume_hitbox.x1 and mouse.x <= volume_hitbox.x2 and mouse.y >= volume_hitbox.y1 and mouse.y <= volume_hitbox.y2 then
    if active_popup then
      active_popup = nil
    end
    dragging_volume = true
    local vol_x = volume_hitbox.x1 + 4
    local vol_w = (volume_hitbox.x2 - volume_hitbox.x1) - 8
    if vol_w > 0 then
      local ratio = (mouse.x - vol_x) / vol_w
      set_volume_ratio(ratio)
    end
    show()
    return
  end

  -- 4. Check Control & Popout Buttons
  for _, btn in ipairs(buttons) do
    if mouse.x >= btn.x1 and mouse.x <= btn.x2 and mouse.y >= btn.y1 and mouse.y <= btn.y2 then
      if btn.callback then
        btn.callback()
      end
      show()
      return
    end
  end

  -- 5. Click outside popout closes popout
  if active_popup then
    active_popup = nil
    show()
    return
  end

  show()
end

local function on_mouse_move()
  local mouse = mp.get_property_native("mouse-pos")
  if not mouse then return end

  local prev_hover_btn = hover_btn_id
  local prev_hover_ratio = hover_ratio
  hover_btn_id = nil

  if dragging_timeline and timeline_hitbox then
    local seek_x = timeline_hitbox.x1 + 4
    local seek_w = (timeline_hitbox.x2 - timeline_hitbox.x1) - 8
    if seek_w > 0 then
      local ratio = math.max(0, math.min(1, (mouse.x - seek_x) / seek_w))
      seek_to_ratio(ratio)
      hover_ratio = ratio
    end
  elseif dragging_volume and volume_hitbox then
    local vol_x = volume_hitbox.x1 + 4
    local vol_w = (volume_hitbox.x2 - volume_hitbox.x1) - 8
    if vol_w > 0 then
      local ratio = math.max(0, math.min(1, (mouse.x - vol_x) / vol_w))
      set_volume_ratio(ratio)
    end
  elseif timeline_hitbox and mouse.x >= timeline_hitbox.x1 and mouse.x <= timeline_hitbox.x2 and mouse.y >= timeline_hitbox.y1 and mouse.y <= timeline_hitbox.y2 then
    local seek_x = timeline_hitbox.x1 + 4
    local seek_w = (timeline_hitbox.x2 - timeline_hitbox.x1) - 8
    if seek_w > 0 then
      hover_ratio = math.max(0, math.min(1, (mouse.x - seek_x) / seek_w))
    end
  else
    hover_ratio = nil
  end

  if volume_hitbox and mouse.x >= volume_hitbox.x1 and mouse.x <= volume_hitbox.x2 and mouse.y >= volume_hitbox.y1 and mouse.y <= volume_hitbox.y2 then
    hover_btn_id = "vol_bar"
  elseif skip_hitbox and mouse.x >= skip_hitbox.x1 and mouse.x <= skip_hitbox.x2 and mouse.y >= skip_hitbox.y1 and mouse.y <= skip_hitbox.y2 then
    hover_btn_id = "skip_btn"
  else
    for _, btn in ipairs(buttons) do
      if mouse.x >= btn.x1 and mouse.x <= btn.x2 and mouse.y >= btn.y1 and mouse.y <= btn.y2 then
        hover_btn_id = btn.id
        break
      end
    end
  end

  show()
  if prev_hover_btn ~= hover_btn_id or prev_hover_ratio ~= hover_ratio then
    render()
  end
end

-- Key & Mouse Bindings
mp.add_forced_key_binding("MBTN_LEFT", "stream-click", handle_mouse_click, { complex = true })
mp.add_forced_key_binding("MBTN_LEFT_DBL", "stream-dbl", function()
  mp.command("cycle fullscreen")
end)

mp.add_forced_key_binding("WHEEL_UP", "stream-wheel-up", function()
  adjust_volume(5)
end)
mp.add_forced_key_binding("WHEEL_DOWN", "stream-wheel-down", function()
  adjust_volume(-5)
end)

mp.add_key_binding("SPACE", "stream-play-pause", function()
  mp.command("cycle pause")
  show()
end)

mp.add_key_binding("LEFT", "stream-seek-back", function()
  mp.commandv("seek", -10, "relative")
  show()
end)

mp.add_key_binding("RIGHT", "stream-seek-fwd", function()
  mp.commandv("seek", 10, "relative")
  show()
end)

mp.add_key_binding("UP", "stream-vol-up", function()
  adjust_volume(5)
end)

mp.add_key_binding("DOWN", "stream-vol-down", function()
  adjust_volume(-5)
end)

mp.add_key_binding("s", "stream-cycle-sub", function()
  mp.command("cycle sub")
  show_osd_toast("Subtitle: " .. get_track_label("sub"))
end)

mp.add_key_binding("a", "stream-cycle-audio", function()
  mp.command("cycle audio")
  show_osd_toast("Audio: " .. get_track_label("audio"))
end)

mp.add_key_binding("S", "stream-skip-intro", function()
  if skip_target then
    mp.commandv("seek", skip_target, "absolute")
    skip_target = nil
    skip_label = nil
    show()
  end
end)

mp.add_key_binding("ESC", "stream-esc", function()
  if active_popup then
    active_popup = nil
    show()
  end
end)

mp.add_key_binding("f", "stream-fs", function()
  mp.command("cycle fullscreen")
  show()
end)

mp.add_key_binding("m", "stream-mute", function()
  mp.command("cycle mute")
  show()
end)

-- Native Mouse Movement Tracking
mp.observe_property("mouse-pos", "native", function()
  on_mouse_move()
end)

-- Property Observers for live UI updates
mp.observe_property("time-pos", "number", function()
  if visible then
    render()
  end
end)

mp.observe_property("duration", "number", function()
  if visible then
    render()
  end
end)

mp.observe_property("pause", "bool", function()
  show()
end)

mp.observe_property("volume", "number", function()
  show()
end)

mp.observe_property("mute", "bool", function()
  show()
end)

mp.observe_property("speed", "number", function()
  show()
end)

mp.observe_property("track-list", "native", function()
  if visible then
    render()
  end
end)

mp.observe_property("osd-dimensions", "native", function()
  if visible then
    render()
  end
end)

-- IPC Custom Command to register Skip Points from Web UI
mp.register_script_message("set-skip-interval", function(target, label)
  skip_target = tonumber(target)
  skip_label = label or "Skip Intro"
  if visible then
    render()
  end
end)

mp.register_script_message("register-skip-interval", function(start_t, end_t, label, skip_type)
  local st = tonumber(start_t)
  local et = tonumber(end_t)
  if st and et and et > st then
    table.insert(registered_intervals, {
      start_t = st,
      end_t = et,
      label = label or "Intro",
      skip_type = skip_type or "op",
    })
    if visible then
      render()
    end
  end
end)

mp.register_script_message("clear-skip-intervals", function()
  registered_intervals = {}
  if visible then
    render()
  end
end)

mp.register_script_message("toggle-sub-popup", function()
  active_popup = (active_popup == "sub") and nil or "sub"
  show()
end)

mp.register_script_message("toggle-audio-popup", function()
  active_popup = (active_popup == "audio") and nil or "audio"
  show()
end)

show()
