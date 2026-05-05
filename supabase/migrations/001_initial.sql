-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Stores every generated case (including the correct answer, hidden from frontend)
create table if not exists cases (
    id          uuid primary key default uuid_generate_v4(),
    topic       text not null,
    subtopic    text not null,
    case_data   jsonb not null,  -- full case including correct answer + explanation
    created_at  timestamptz not null default now()
);

-- Tracks every student answer
create table if not exists attempts (
    id              uuid primary key default uuid_generate_v4(),
    case_id         uuid references cases(id) on delete cascade,
    student_id      text not null,
    selected_answer text not null,
    is_correct      boolean not null,
    topic           text not null,
    subtopic        text not null,
    attempted_at    timestamptz not null default now()
);

-- Fast lookups for performance dashboard and adaptive topic selection
create index if not exists attempts_student_idx on attempts(student_id);
create index if not exists attempts_student_topic_idx on attempts(student_id, topic);
