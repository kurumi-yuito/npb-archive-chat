ALTER TABLE source_snapshots ADD COLUMN raw_path TEXT;
ALTER TABLE source_snapshots ADD COLUMN structured_path TEXT;

ALTER TABLE events ADD COLUMN runs_scored INTEGER;
ALTER TABLE events ADD COLUMN score_change TEXT;
ALTER TABLE events ADD COLUMN substitution TEXT;
ALTER TABLE events ADD COLUMN pitching_change TEXT;
ALTER TABLE events ADD COLUMN source_url TEXT;
ALTER TABLE events ADD COLUMN source_text TEXT;

ALTER TABLE batting_lines ADD COLUMN strikeouts INTEGER;
ALTER TABLE batting_lines ADD COLUMN walks INTEGER;
ALTER TABLE batting_lines ADD COLUMN hit_by_pitch INTEGER;
ALTER TABLE batting_lines ADD COLUMN sacrifice_hits INTEGER;
ALTER TABLE batting_lines ADD COLUMN sacrifice_flies INTEGER;
ALTER TABLE batting_lines ADD COLUMN errors INTEGER;
ALTER TABLE batting_lines ADD COLUMN raw_text TEXT;
ALTER TABLE batting_lines ADD COLUMN source_url TEXT;

ALTER TABLE pitching_lines ADD COLUMN sequence INTEGER;
ALTER TABLE pitching_lines ADD COLUMN pitches INTEGER;
ALTER TABLE pitching_lines ADD COLUMN hits_allowed INTEGER;
ALTER TABLE pitching_lines ADD COLUMN home_runs_allowed INTEGER;
ALTER TABLE pitching_lines ADD COLUMN hit_by_pitch INTEGER;
ALTER TABLE pitching_lines ADD COLUMN runs_allowed INTEGER;
ALTER TABLE pitching_lines ADD COLUMN win_loss_save_hold TEXT;
ALTER TABLE pitching_lines ADD COLUMN raw_text TEXT;
ALTER TABLE pitching_lines ADD COLUMN source_url TEXT;

ALTER TABLE roster_entries ADD COLUMN uniform_number TEXT;
ALTER TABLE roster_entries ADD COLUMN position TEXT;
ALTER TABLE roster_entries ADD COLUMN starter INTEGER;
ALTER TABLE roster_entries ADD COLUMN batting_order INTEGER;
ALTER TABLE roster_entries ADD COLUMN raw_text TEXT;
ALTER TABLE roster_entries ADD COLUMN source_url TEXT;
