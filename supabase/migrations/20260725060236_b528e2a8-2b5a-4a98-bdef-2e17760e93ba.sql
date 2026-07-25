CREATE OR REPLACE FUNCTION public.create_publication_atomic(
  _club_id uuid,
  _publication_type public.publication_type,
  _title text,
  _content text,
  _poll_visibility public.poll_visibility,
  _publish_to_wall boolean,
  _send_email boolean,
  _email_body text,
  _closes_at timestamptz,
  _event_id uuid,
  _audiences jsonb,
  _manual_member_ids jsonb,
  _poll_options jsonb,
  _document_ids jsonb,
  _media_paths jsonb
)
RETURNS TABLE(
  publication_id uuid,
  dispatch_row_id uuid,
  recipients_count integer,
  new_recipient_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _publication_id uuid;
  _aud jsonb;
  _audience_type public.publication_audience_type;
  _manual_id uuid;
  _option_label text;
  _document_id uuid;
  _media_path text;
  _idx integer;
  _dispatch record;
  _manual_marker_exists boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.is_club_staff(auth.uid(), _club_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF length(btrim(coalesce(_title, ''))) = 0 OR length(_title) > 200 THEN
    RAISE EXCEPTION 'invalid_title';
  END IF;

  IF length(coalesce(_content, '')) > 20000 THEN
    RAISE EXCEPTION 'invalid_content';
  END IF;

  _audiences := coalesce(_audiences, '[]'::jsonb);
  _manual_member_ids := coalesce(_manual_member_ids, '[]'::jsonb);
  _poll_options := coalesce(_poll_options, '[]'::jsonb);
  _document_ids := coalesce(_document_ids, '[]'::jsonb);
  _media_paths := coalesce(_media_paths, '[]'::jsonb);

  IF jsonb_typeof(_audiences) <> 'array'
    OR jsonb_typeof(_manual_member_ids) <> 'array'
    OR jsonb_typeof(_poll_options) <> 'array'
    OR jsonb_typeof(_document_ids) <> 'array'
    OR jsonb_typeof(_media_paths) <> 'array' THEN
    RAISE EXCEPTION 'invalid_payload';
  END IF;

  IF jsonb_array_length(_audiences) = 0 AND jsonb_array_length(_manual_member_ids) = 0 THEN
    RAISE EXCEPTION 'audience_required';
  END IF;

  IF _publication_type = 'poll' THEN
    IF _poll_visibility IS NULL THEN
      RAISE EXCEPTION 'poll_visibility_required';
    END IF;
    IF jsonb_array_length(_poll_options) < 2 THEN
      RAISE EXCEPTION 'poll_options_min_2';
    END IF;
  END IF;

  IF NOT coalesce(_publish_to_wall, false) AND NOT coalesce(_send_email, false) THEN
    RAISE EXCEPTION 'delivery_required';
  END IF;

  INSERT INTO public.club_publications(
    club_id,
    author_id,
    publication_type,
    title,
    content,
    poll_visibility,
    publish_to_wall,
    send_email,
    email_body,
    closes_at,
    event_id
  )
  VALUES (
    _club_id,
    auth.uid(),
    _publication_type,
    btrim(_title),
    coalesce(_content, ''),
    CASE WHEN _publication_type = 'poll' THEN _poll_visibility ELSE NULL END,
    coalesce(_publish_to_wall, false),
    CASE WHEN NOT coalesce(_publish_to_wall, false) THEN true ELSE coalesce(_send_email, false) END,
    _email_body,
    _closes_at,
    _event_id
  )
  RETURNING id INTO _publication_id;

  FOR _aud IN SELECT value FROM jsonb_array_elements(_audiences) LOOP
    _audience_type := (_aud->>'audience_type')::public.publication_audience_type;
    IF _audience_type = 'selection_manuelle' THEN
      _manual_marker_exists := true;
    END IF;

    INSERT INTO public.club_publication_audiences(
      publication_id,
      audience_type,
      team_id,
      group_id,
      category_label,
      season_id,
      event_id
    )
    VALUES (
      _publication_id,
      _audience_type,
      NULLIF(_aud->>'team_id', '')::uuid,
      NULLIF(_aud->>'group_id', '')::uuid,
      NULLIF(_aud->>'category_label', ''),
      NULLIF(_aud->>'season_id', '')::uuid,
      NULLIF(_aud->>'event_id', '')::uuid
    );
  END LOOP;

  IF jsonb_array_length(_manual_member_ids) > 0 AND NOT _manual_marker_exists THEN
    INSERT INTO public.club_publication_audiences(publication_id, audience_type)
    VALUES (_publication_id, 'selection_manuelle');
  END IF;

  FOR _manual_id IN SELECT value::uuid FROM jsonb_array_elements_text(_manual_member_ids) AS t(value) LOOP
    INSERT INTO public.club_publication_manual_members(publication_id, member_id)
    VALUES (_publication_id, _manual_id)
    ON CONFLICT DO NOTHING;
  END LOOP;

  _idx := 0;
  FOR _option_label IN SELECT value FROM jsonb_array_elements_text(_poll_options) AS t(value) LOOP
    _option_label := btrim(_option_label);
    IF length(_option_label) = 0 OR length(_option_label) > 120 THEN
      RAISE EXCEPTION 'invalid_poll_option';
    END IF;
    INSERT INTO public.club_poll_options(publication_id, label, sort_order)
    VALUES (_publication_id, _option_label, _idx);
    _idx := _idx + 1;
  END LOOP;

  _idx := 0;
  FOR _document_id IN SELECT value::uuid FROM jsonb_array_elements_text(_document_ids) AS t(value) LOOP
    INSERT INTO public.club_publication_documents(publication_id, document_id, sort_order)
    VALUES (_publication_id, _document_id, _idx);
    _idx := _idx + 1;
  END LOOP;

  _idx := 0;
  FOR _media_path IN SELECT value FROM jsonb_array_elements_text(_media_paths) AS t(value) LOOP
    _media_path := btrim(_media_path);
    IF length(_media_path) = 0 THEN
      RAISE EXCEPTION 'invalid_media_path';
    END IF;
    INSERT INTO public.club_publication_media(publication_id, storage_path, sort_order)
    VALUES (_publication_id, _media_path, _idx);
    _idx := _idx + 1;
  END LOOP;

  SELECT * INTO _dispatch
  FROM public.publish_publication_atomic(_publication_id, 'publish', NULL)
  LIMIT 1;

  IF _dispatch.dispatch_row_id IS NULL THEN
    RAISE EXCEPTION 'publish_failed';
  END IF;

  publication_id := _publication_id;
  dispatch_row_id := _dispatch.dispatch_row_id;
  recipients_count := coalesce(_dispatch.recipients_count, 0);
  new_recipient_count := coalesce(_dispatch.new_recipient_count, 0);
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_publication_atomic(uuid, public.publication_type, text, text, public.poll_visibility, boolean, boolean, text, timestamptz, uuid, jsonb, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_publication_atomic(uuid, public.publication_type, text, text, public.poll_visibility, boolean, boolean, text, timestamptz, uuid, jsonb, jsonb, jsonb, jsonb, jsonb) TO authenticated;