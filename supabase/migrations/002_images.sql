-- Medical images stored in Cloudflare R2
create table if not exists images (
    id          uuid primary key default uuid_generate_v4(),
    diagnosis   text not null,       -- e.g. "Pneumonia", "Pleural Effusion"
    tags        text[] not null default '{}',
    r2_url      text not null,       -- Cloudflare R2 public URL
    source      text not null,       -- "NIH", "RSNA", "OpenI"
    created_at  timestamptz not null default now()
);

create index if not exists images_diagnosis_idx on images(diagnosis);
