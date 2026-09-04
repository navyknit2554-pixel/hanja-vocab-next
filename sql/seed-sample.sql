insert into teachers (name, code)
values ('마스터', 'master')
on conflict (code) do update set name = excluded.name;

insert into curriculum_days (level, day, title, daily_count, review_after)
values ('초급', 1, '높고 낮음', 4, false)
on conflict (level, day) do update set
  title = excluded.title,
  daily_count = excluded.daily_count,
  updated_at = now();

with lesson as (
  select id from curriculum_days where level = '초급' and day = 1
)
insert into hanja_items (curriculum_day_id, position, character, sound, meaning, radical, relation_role, origin_note, relation_note)
select id, 1, '高', '고', '높다', '高', '관계 한자', '높은 누각의 모습을 본뜬 한자로 봅니다.', '低와 높고 낮음의 관계로 묶습니다.' from lesson
union all
select id, 2, '低', '저', '낮다', '人', '관계 한자', '사람이 몸을 낮춘 모습과 관련해 봅니다.', '高와 높고 낮음의 관계로 묶습니다.' from lesson
union all
select id, 3, '苦', '고', '쓰다', '艸', '동음 한자', '풀과 입의 결합으로 쓴맛과 괴로움을 떠올립니다.', '高와 음이 같은 다른 뜻의 한자입니다.' from lesson
union all
select id, 4, '著', '저', '나타나다', '艸', '동음 한자', '분명하게 드러남과 관련된 한자입니다.', '低와 음이 같은 다른 뜻의 한자입니다.' from lesson
on conflict (curriculum_day_id, position) do update set
  character = excluded.character,
  sound = excluded.sound,
  meaning = excluded.meaning,
  radical = excluded.radical,
  relation_role = excluded.relation_role,
  origin_note = excluded.origin_note,
  relation_note = excluded.relation_note,
  updated_at = now();

with teacher as (
  select id from teachers where code = 'master'
)
insert into students (teacher_id, name, login_id, password, phone, grade, level, current_day)
select id, '테스트학생', 'test', '1234', '01000000000', '초3', '초급', 1 from teacher
on conflict (teacher_id, login_id) do update set
  name = excluded.name,
  password = excluded.password,
  grade = excluded.grade,
  level = excluded.level,
  current_day = excluded.current_day,
  updated_at = now();
