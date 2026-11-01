# Graph Report - tiktak  (2026-11-01)

## Corpus Check
- 179 files · ~51,634 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 3, .example 2, .css 1)

## Summary
- 1116 nodes · 2283 edges · 77 communities (65 shown, 12 thin omitted)
- Extraction: 94% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 124 edges (avg confidence: 0.85)
- Token cost: 622,462 input · 0 output

## Community Hubs (Navigation)
- Frontend API Client Layer
- AI Service Python Core
- Frontend Admin API
- Frontend Dependencies
- Use Case Diagram
- Mongoose Data Models
- Backend AI Client
- S3 MinIO Storage
- Frontend Mock Backend
- Admin & Feed Query Tests
- Admin Moderation Tests
- Express App Middleware
- Video Service Queries
- Backend Runtime Dependencies
- Auth & Video Controllers
- Comment & Feed Controllers
- Console Feed & Upload
- Redis & Job Workers
- Auth & Notification Tests
- Backend Package Manifest
- Queue & DB Config
- Console Admin Panel
- Admin Controller
- Comment API Tests
- UML Class Diagram
- Console Auth & Socket
- FFmpeg Transcode Job
- Auth & Like Tests
- Console Notifications
- Frontend Known Bugs
- AI Dubbing Feature Plan
- Architecture & Roadmap
- Console Video Actions
- Console Comments
- Console Users & Follow
- Dubbing Controller
- Upload Middleware & Routes
- Notification Service
- System Architecture Overview
- AI Service HTTP API
- Upload Controller
- User Controller
- Rate Limiting & Video Routes
- Auth Validation & Routes
- Compose AI Service
- Compose Backend Services
- Compose MinIO
- ERD Diagram
- Dubbing & User Routes
- Auth Middleware & Feed Routes
- Whisper & NLLB Models
- Passport JWT Strategy
- Auth Service
- Compose MongoDB
- Compose Healthchecks
- Backend NPM Scripts
- Comment & Notification Routes
- Compose Redis
- Follow API Tests
- Upload & Watch Tests
- Winston Logger
- Admin Routes & Roles
- Compose Volumes
- Joi Video Validator
- Frontend HTML Shell
- Env Validation
- Subtitle Model
- Rate Limit Dependency
- Sharp Dependency
- Trending Feed Bug
- Audit & Moderation Docs
- Following Feed Doc
- Planned Vector Search

## God Nodes (most connected - your core abstractions)
1. `success()` - 46 edges
2. `error()` - 37 edges
3. `apiRequest()` - 30 edges
4. `mongoose` - 24 edges
5. `Bearer Token auth (JWT)` - 24 edges
6. `useAuth()` - 23 edges
7. `react` - 22 edges
8. `lucide-react` - 22 edges
9. `errMsg()` - 22 edges
10. `Avatar()` - 22 edges

## Surprising Connections (you probably didn't know these)
- `Third-party AI APIs first, self-host later` --conceptually_related_to--> `TikTak AI Service`  [AMBIGUOUS]
  plan.md → ai-service/README.md
- `POST /tts` --implements--> `Time-alignment of dubbed audio`  [INFERRED]
  ai-service/README.md → plan.md
- `TikTak Frontend` --references--> `Frontend (React + Vite)`  [INFERRED]
  frontend/README.md → README.md
- `DubbingStatusBadge` --references--> `Translation and Dubbing Pipeline`  [INFERRED]
  frontend/README.md → README.md
- `LanguageSelector` --references--> `Translation and Dubbing Pipeline`  [INFERRED]
  frontend/README.md → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **STT -> Translate -> TTS dubbing flow** — ai_service_readme_transcribe_endpoint, ai_service_readme_translate_endpoint, ai_service_readme_tts_endpoint, ai_service_readme_segment_contract, backend_src_services_ai_dubbingpipeline_service [EXTRACTED 1.00]
- **Open-source AI model stack (Whisper, NLLB-200, edge-tts)** — ai_service_readme_faster_whisper, ai_service_readme_nllb_200, ai_service_readme_edge_tts [EXTRACTED 1.00]
- **Async background processing with progress reporting** — readme_bullmq, readme_hls_transcode, readme_dubbing_pipeline, readme_sse_progress, plan_bullmq_job_queue [INFERRED 0.85]
- **Login -> token storage -> socket auth -> unread notifications** — backend_public_index_quicklogin, backend_public_index_api_auth_login, backend_public_index_jwt_token_storage, backend_public_index_initsocket, backend_public_index_socket_io_client, backend_public_index_checkunreadnotifications [EXTRACTED 1.00]
- **Video upload -> MinIO -> transcode -> SSE progress** — backend_public_index_submitvideoupload, backend_public_index_api_upload, backend_public_index_minio_storage, backend_public_index_transcode_queue, backend_public_index_api_upload_progress, backend_public_index_sse_upload_progress [INFERRED 0.85]
- **Report video -> flagged queue -> admin approve/remove** — backend_public_index_reportvideo, backend_public_index_api_videos_report, backend_public_index_api_admin_videos_flagged, backend_public_index_approvevideo, backend_public_index_removevideoadmin [INFERRED 0.85]
- **Admin user moderation flow (list, ban, unban, verify)** — api_admin_get_users, api_admin_ban_user, api_admin_unban_user, api_admin_verify_user, api_entity_user [INFERRED 0.85]
- **Admin video removal recorded in audit log** — api_admin_get_videos, api_admin_delete_video, api_admin_audit_logs, api_entity_admin_log, api_entity_video [INFERRED 0.85]
- **Auth session flow: register -> login -> me -> logout (Bearer JWT)** — api_auth_register, api_auth_login, api_auth_me, api_auth_logout, api_auth_bearer_token [INFERRED 0.85]
- **Notification read-state flow: list, unread count, mark one/all read** — api_notifications_list, api_notifications_unread_count, api_notifications_mark_read, api_notifications_read_all, api_entity_notification [INFERRED 0.85]
- **Comment lifecycle endpoints: create, list, reply, like, delete** — api_comments_send_comment, api_comments_get_video_comments, api_comments_get_comment_replies, api_comments_like_comment, api_comments_delete_comment [INFERRED 0.85]
- **Like/unlike toggle on same endpoint** — backend_bao_cao_tuan_4_img_comments_like_comment_screenshot, backend_bao_cao_tuan_4_img_comments_remove_like_comment_screenshot, api_comments_like_comment [EXTRACTED 1.00]
- **Video interaction endpoints (like, view, edit, delete) on /api/videos/:id** — api_video_like, api_video_record_view, api_video_update, api_video_delete, api_entity_video [EXTRACTED 1.00]
- **Feed listing endpoints returning Video lists with populated User** — api_feed_for_you, api_feed_following, api_entity_video, api_entity_user [INFERRED 0.85]
- **Video engagement actions (like toggle, report) on a video by an authenticated user** — api_video_like, api_feed_report_video, api_entity_video, api_entity_user, api_auth_bearer_token [INFERRED 0.85]
- **Upload pipeline: multipart upload -> object storage -> processing queue -> HLS-ready video** — api_feed_upload_video, api_object_storage_minio, api_video_processing_queue, api_entity_video [INFERRED 0.85]
- **User API endpoints (/api/users)** — api_user_search, api_user_get_profile, api_user_follow, api_user_videos, api_user_update_me, api_user_delete_me [EXTRACTED 1.00]
- **Authenticated self endpoints on /api/users/me** — api_user_update_me, api_user_delete_me, api_auth_bearer_token [INFERRED 0.85]
- **Social interaction subsystem (users, follows, likes, comments)** — backend_diagrams_class_diagram_user, backend_diagrams_class_diagram_follow, backend_diagrams_class_diagram_like, backend_diagrams_class_diagram_comment [INFERRED 0.85]
- **Video localization (dubbing + subtitles)** — backend_diagrams_class_diagram_video, backend_diagrams_class_diagram_audiotrack, backend_diagrams_class_diagram_subtitle, backend_diagrams_class_diagram_dubbingstatusenum [INFERRED 0.85]
- **Video processing and moderation lifecycle** — backend_diagrams_class_diagram_video, backend_diagrams_class_diagram_videostatusenum, backend_diagrams_class_diagram_moderationenum [INFERRED 0.75]
- **Video engagement (comments, likes)** — backend_diagrams_erd_video, backend_diagrams_erd_comment, backend_diagrams_erd_like, backend_diagrams_erd_user [INFERRED 0.85]
- **Video localization (subtitles, dubbed audio tracks)** — backend_diagrams_erd_video, backend_diagrams_erd_subtitle, backend_diagrams_erd_audiotrack [INFERRED 0.85]
- **Social graph (follow, notifications)** — backend_diagrams_erd_user, backend_diagrams_erd_follow, backend_diagrams_erd_notification [INFERRED 0.75]
- **Video management subsystem** — backend_diagrams_usecase_quan_li_video, backend_diagrams_usecase_upload, backend_diagrams_usecase_chinh_sua_thong_tin_video, backend_diagrams_usecase_dat_quyen_rieng_tu, backend_diagrams_usecase_xoa_video, backend_diagrams_usecase_chon_ngon_ngu_dich, backend_diagrams_usecase_thong_ke_luot_xem_tuong_tac, backend_diagrams_usecase_chinh_sua_phu_de [EXTRACTED 1.00]
- **Video interaction subsystem** — backend_diagrams_usecase_tuong_tac, backend_diagrams_usecase_like_unlike, backend_diagrams_usecase_viet_comment, backend_diagrams_usecase_xoa_comment, backend_diagrams_usecase_follow_unfollow, backend_diagrams_usecase_chia_se_video, backend_diagrams_usecase_luu_video [EXTRACTED 1.00]
- **Admin moderation and statistics** — backend_diagrams_usecase_admin, backend_diagrams_usecase_xem_dashboard_thong_ke, backend_diagrams_usecase_khoa_mo_tai_khoan, backend_diagrams_usecase_duyet_go_video, backend_diagrams_usecase_thong_ke_luot_xem_like [INFERRED 0.85]

## Communities (77 total, 12 thin omitted)

### Community 0 - "Frontend API Client Layer"
Cohesion: 0.05
Nodes (112): API_URL, errMsg(), USE_MOCK, d(), getDubbingStatus(), getSupportedLanguages(), getVideoTracks(), requestDubbing() (+104 more)

### Community 1 - "AI Service Python Core"
Cohesion: 0.06
Nodes (31): get_settings(), Settings, Config, download_audio(), health(), transcribe_endpoint(), translate_endpoint(), tts_endpoint() (+23 more)

### Community 2 - "Frontend Admin API"
Cohesion: 0.09
Nodes (27): banUser(), d(), getAdminVideos(), getAuditLogs(), getFlaggedVideos(), getStats(), getUsers(), unbanUser() (+19 more)

### Community 3 - "Frontend Dependencies"
Cohesion: 0.07
Nodes (36): dependencies, axios@^1.7.3, framer-motion@^11.3.0, hls.js@^1.5.13, lucide-react@^0.400.0, react@^18.3.0, react-dom@^18.3.0, react-hook-form@^7.52.0 (+28 more)

### Community 4 - "Use Case Diagram"
Cohesion: 0.06
Nodes (33): Use Case Diagram (usecase.jpg), Admin (actor), Cập nhật thông tin (Update profile), Chia sẻ video, Chỉnh sửa phụ đề/bản dịch, Chỉnh sửa thông tin video, Chọn ngôn ngữ dịch, Đăng kí tài khoản (Register) (+25 more)

### Community 5 - "Mongoose Data Models"
Cohesion: 0.08
Nodes (21): mongoose@^8.5.0, auditLogSchema, mongoose, commentSchema, mongoose, followSchema, mongoose, likeSchema (+13 more)

### Community 6 - "Backend AI Client"
Cohesion: 0.16
Nodes (18): getAiHealth(), axios, baseURL(), health(), http, isMock(), mediaUrlForAI(), post() (+10 more)

### Community 7 - "S3 MinIO Storage"
Cohesion: 0.11
Nodes (20): @aws-sdk/client-s3@^3.623.0, BUCKETS, publicUrl(), s3, { S3Client }, contentTypeOf(), ensureBucket(), ensureBuckets() (+12 more)

### Community 8 - "Frontend Mock Backend"
Cohesion: 0.10
Nodes (18): ago(), authed(), CLIPS, comments, fail(), LANGS, likes, LINES (+10 more)

### Community 9 - "Admin & Feed Query Tests"
Cohesion: 0.10
Nodes (21): GET /api/admin/stats, GET /api/admin/videos, Admin dashboard stats, Hashtag, Video, GET /api/feed/following (Following feed), GET /api/feed/for-you (For You feed), GET /api/videos/search?q&limit (+13 more)

### Community 10 - "Admin Moderation Tests"
Cohesion: 0.12
Nodes (20): GET /api/admin/audit-logs, POST /api/admin/users/:id/ban, Admin delete comment endpoint, DELETE /api/admin/videos/:id, GET /api/admin/users, POST /api/admin/users/:id/unban, POST /api/auth/register (username, email, password), AdminLog (audit log) (+12 more)

### Community 11 - "Express App Middleware"
Cohesion: 0.11
Nodes (16): cors@^2.8.5, helmet@^7.1.0, morgan@^1.10.0, allowedOrigins, app, cors, express, helmet (+8 more)

### Community 12 - "Video Service Queries"
Cohesion: 0.18
Nodes (15): buildCursorQuery(), deleteVideo(), findPaged(), getFollowingFeed(), getForYouFeed(), getUserVideos(), getVideoById(), httpError() (+7 more)

### Community 13 - "Backend Runtime Dependencies"
Cohesion: 0.11
Nodes (19): dependencies, @aws-sdk/lib-storage@^3.623.0, axios@^1.7.3, dotenv@^16.4.5, fluent-ffmpeg@^2.1.3, ioredis@^5.4.1, jsonwebtoken@^9.0.2, multer@^1.4.5-lts.1 (+11 more)

### Community 14 - "Auth & Video Controllers"
Cohesion: 0.18
Nodes (15): login(), logout(), me(), refresh(), register(), deleteVideo(), getTrendingHashtags(), getVideo() (+7 more)

### Community 15 - "Comment & Feed Controllers"
Cohesion: 0.15
Nodes (15): createComment(), deleteComment(), getComments(), getReplies(), likeComment(), mongoose, getFollowingFeed(), getForYouFeed() (+7 more)

### Community 16 - "Console Feed & Upload"
Cohesion: 0.16
Nodes (17): GET /api/feed/following, GET /api/feed/for-you, POST /api/upload, GET /api/upload/:jobId/progress (SSE), GET /api/videos/hashtags/trending, GET /api/videos/search, loadFeed(), loadTrendingHashtags() (+9 more)

### Community 17 - "Redis & Job Workers"
Cohesion: 0.21
Nodes (11): IORedis, redis, startDubbingWorker(), { Worker }, startTranscodeWorker(), http, main(), { Server } (+3 more)

### Community 18 - "Auth & Notification Tests"
Cohesion: 0.15
Nodes (16): POST /api/admin/users/:id/verify, Bearer Token auth (JWT), POST /api/auth/login (email + password), Notification (userId, type e.g. new_follower/mention, payload actor*, isRead), GET /api/notifications?limit (list notifications), PATCH /api/notifications/:id/read (mark one as read), POST /api/notifications/read-all (mark all as read), GET /api/notifications/unread-count (+8 more)

### Community 19 - "Backend Package Manifest"
Cohesion: 0.13
Nodes (15): @aws-sdk/s3-request-presigner@^3.623.0, bcryptjs@^2.4.3, express-async-errors@^3.1.0, socket.io@^4.7.5, description, devDependencies, nodemon@^3.1.4, main (+7 more)

### Community 20 - "Queue & DB Config"
Cohesion: 0.16
Nodes (13): bullmq@^5.12.12, connectDB(), mongoose, streamProgress(), defaultJobOptions, dubbingQueue, getProgress(), progressKey() (+5 more)

### Community 21 - "Console Admin Panel"
Cohesion: 0.13
Nodes (15): GET /api/admin/audit-logs, GET /api/admin/stats, GET /api/admin/users, POST /api/admin/users/:id/ban, POST /api/admin/users/:id/unban, POST /api/admin/users/:id/verify, POST /api/admin/videos/:id/approve, DELETE /api/admin/videos/:id (+7 more)

### Community 22 - "Admin Controller"
Cohesion: 0.31
Nodes (14): approveVideo(), banUser(), buildPagination(), createAuditLog(), getAuditLogs(), getFlaggedVideos(), getStats(), getUsers() (+6 more)

### Community 23 - "Comment API Tests"
Cohesion: 0.18
Nodes (14): DELETE /api/comments/:id, GET /api/comments/:id/replies, GET /api/comments/video/:videoId, POST /api/comments/:id/like (toggle like/unlike), POST /api/comments (create comment or reply), Comment, Reply (Comment with parentId), Postman: DELETE /api/comments/:id (delete comment) -> 200 OK 'Comment deleted', data null, Bearer auth (+6 more)

### Community 24 - "UML Class Diagram"
Cohesion: 0.32
Nodes (14): Class Diagram (TikTok-like backend), AudioTrack, Comment, DubbingStatusEnum, Follow, Like, ModerationEnum, RoleEnum (+6 more)

### Community 25 - "Console Auth & Socket"
Cohesion: 0.21
Nodes (13): POST /api/auth/login, GET /api/notifications, copyResponse(), Quick Login Account Switcher, initSocket(), JWT token in localStorage (tiktak_token), logout(), quickLogin() (+5 more)

### Community 26 - "FFmpeg Transcode Job"
Cohesion: 0.21
Nodes (11): checkFfmpeg(), extractThumbnail(), ffmpeg, fs, fsp, os, path, probe() (+3 more)

### Community 27 - "Auth & Like Tests"
Cohesion: 0.15
Nodes (13): POST /api/auth/logout (Bearer auth), GET /api/auth/me (current user info, Bearer auth), Like, API response envelope {success, message, data}, GET /api/users/search?q= (search users), POST /api/videos/:id/like (like video), POST /api/videos/:id/view (record view, body watchTimeMs), Postman: GET /api/auth/me (get info) -> 200 OK, current user profile (+5 more)

### Community 28 - "Console Notifications"
Cohesion: 0.26
Nodes (13): GET /api/auth/me, PATCH /api/notifications/:id/read, POST /api/notifications/read-all, GET /api/notifications/unread-count, apiRequest(), checkMyProfile(), checkUnreadNotifications(), loadNotifications() (+5 more)

### Community 29 - "Frontend Known Bugs"
Cohesion: 0.18
Nodes (8): DubbingStatusBadge, LanguageSelector, PrivateRoute (role support), TikTak Frontend, VideoPlayer, docs/PIPELINE.md, Frontend (React + Vite), TikTak

### Community 30 - "AI Dubbing Feature Plan"
Cohesion: 0.17
Nodes (8): edge-tts, edge-tts==6.1.12, AudioTrack model, Lip-sync (optional), Subtitle model, Text-to-Speech / Voice Cloning, Voice cloning (planned), Lip-sync with Wav2Lip (planned)

### Community 31 - "Architecture & Roadmap"
Cohesion: 0.18
Nodes (8): CDN video distribution, HLS/DASH streaming, Short Video App + AI Dubbing Plan, Implementation roadmap (7 phases), Redis + BullMQ queue, FFmpeg (fluent-ffmpeg), HLS Transcode (multi-quality), SSE transcode progress

### Community 32 - "Console Video Actions"
Cohesion: 0.18
Nodes (11): GET /api/admin/videos/flagged, POST /api/videos/:id/like, POST /api/videos/:id/report, POST /api/videos/:id/view, Navigation Tabs, openCommentsForVideo(), recordVideoView(), renderVideos() (+3 more)

### Community 33 - "Console Comments"
Cohesion: 0.22
Nodes (10): POST /api/comments, DELETE /api/comments/:id, POST /api/comments/:id/like, GET /api/comments/video/:videoId, cancelReply(), deleteComment(), loadComments(), submitComment() (+2 more)

### Community 34 - "Console Users & Follow"
Cohesion: 0.20
Nodes (11): POST /api/users/:username/follow, PATCH /api/users/me, GET /api/users/:username, GET /api/users/search, GET /api/users/:username/videos, loadUserProfile(), loadUserVideos(), searchUsers() (+3 more)

### Community 35 - "Dubbing Controller"
Cohesion: 0.20
Nodes (9): getDubbingStatus(), getSupportedLanguages(), getVideoTracks(), isStaff(), LANG_CODES, mongoose, requestDubbing(), audioTrackSchema (+1 more)

### Community 36 - "Upload Middleware & Routes"
Cohesion: 0.20
Nodes (5): multer, storage, videoUpload(), express, router

### Community 37 - "Notification Service"
Cohesion: 0.20
Nodes (5): mongoose, notificationSchema, createNotification(), mongoose, emitToUser()

### Community 38 - "System Architecture Overview"
Cohesion: 0.22
Nodes (8): axiosClient (auto refresh token), socket event new_notification, AI Service (FastAPI), Backend (Node.js/Express API server and worker), Google OAuth (Passport), MinIO / AWS S3 storage, MongoDB / Mongoose, Socket.IO realtime notifications

### Community 39 - "AI Service HTTP API"
Cohesion: 0.24
Nodes (9): GET /health, Segment data contract {id,start,end,text}, TikTak AI Service, POST /transcribe, POST /translate, POST /tts, fastapi==0.115.0, pydub==0.25.1 (+1 more)

### Community 40 - "Upload Controller"
Cohesion: 0.24
Nodes (8): createPresignedUpload(), crypto, parseBool(), parseHashtags(), path, uploadVideo(), mongoose, videoSchema

### Community 41 - "User Controller"
Cohesion: 0.24
Nodes (8): deleteAccount(), findUserByParam(), followUser(), getProfile(), getUserVideos(), mongoose, searchUsers(), updateProfile()

### Community 42 - "Rate Limiting & Video Routes"
Cohesion: 0.20
Nodes (6): requireInternalKey(), apiLimiter(), LIGHT_ROUTES, rateLimit, express, router

### Community 43 - "Auth Validation & Routes"
Cohesion: 0.20
Nodes (3): express, router, Joi

### Community 44 - "Compose AI Service"
Cohesion: 0.20
Nodes (10): build, container_name, environment, ports, restart, volumes, AI_INTERNAL_KEY, AI_MODEL_CACHE_DIR (+2 more)

### Community 45 - "Compose Backend Services"
Cohesion: 0.20
Nodes (10): depends_on, minio, condition, container_name, depends_on, entrypoint, image, restart (+2 more)

### Community 46 - "Compose MinIO"
Cohesion: 0.20
Nodes (10): MINIO_ROOT_PASSWORD, MINIO_ROOT_USER, command, container_name, environment, image, ports, restart (+2 more)

### Community 47 - "ERD Diagram"
Cohesion: 0.50
Nodes (9): ERD Diagram (erd.jpg), AudioTrack, Comment, Follow, Like, Notification, Subtitle, User (+1 more)

### Community 48 - "Dubbing & User Routes"
Cohesion: 0.22
Nodes (6): express@^4.19.2, express, router, express, router, express

### Community 49 - "Auth Middleware & Feed Routes"
Cohesion: 0.28
Nodes (6): crypto, getBearerToken(), jwt, optionalAuth(), express, router

### Community 50 - "Whisper & NLLB Models"
Cohesion: 0.25
Nodes (8): AI_MODEL_CACHE_DIR, faster-whisper (small, CPU), NLLB-200 distilled 600M, faster-whisper==1.0.3, torch==2.4.1, transformers==4.44.2, Machine Translation, Speech-to-Text with timestamps

### Community 51 - "Passport JWT Strategy"
Cohesion: 0.25
Nodes (7): passport@^0.7.0, passport-jwt@^4.0.1, opts, passport, { Strategy: JwtStrategy, ExtractJwt }, passport, passport-jwt

### Community 52 - "Auth Service"
Cohesion: 0.39
Nodes (6): generateTokens(), googleAuth(), jwt, login(), refreshToken(), register()

### Community 53 - "Compose MongoDB"
Cohesion: 0.25
Nodes (8): MONGO_INITDB_DATABASE, container_name, environment, image, ports, restart, volumes, mongo

### Community 54 - "Compose Healthchecks"
Cohesion: 0.50
Nodes (8): interval, retries, start_period, test, timeout, healthcheck, healthcheck, healthcheck

### Community 55 - "Backend NPM Scripts"
Cohesion: 0.29
Nodes (7): scripts, create:admin, dev, retranscode, seed, start, worker

### Community 56 - "Comment & Notification Routes"
Cohesion: 0.29
Nodes (5): authenticate(), express, router, express, router

### Community 57 - "Compose Redis"
Cohesion: 0.29
Nodes (7): command, container_name, image, ports, restart, volumes, redis

### Community 58 - "Follow API Tests"
Cohesion: 0.40
Nodes (6): Follow relationship, POST /api/users/:username/follow (toggle follow/unfollow), GET /api/users/:username (view public profile), Postman: POST /api/users/alice_dev/follow -> 200 Now following @alice_dev, following:true, Postman: POST /api/users/alice_dev/follow (toggle) -> 200 Unfollowed @alice_dev, following:false, Postman: GET /api/users/alice_dev (watch profile) -> 200 user profile + totalLikes, videosCount, isFollowing

### Community 59 - "Upload & Watch Tests"
Cohesion: 0.33
Nodes (6): POST /api/upload (multipart: video, title, description, hashtags, isPrivate), GET /api/videos/:id (watch video), Object storage (localhost:9000 tiktak-videos bucket), Video processing job queue (HLS transcoding), Postman: POST /api/upload (multipart video, 201 processing queued), Postman: GET /api/videos/:id watch video (200, populated user, hlsUrl)

### Community 60 - "Winston Logger"
Cohesion: 0.40
Nodes (4): winston@^3.13.0, logger, winston, winston

### Community 61 - "Admin Routes & Roles"
Cohesion: 0.40
Nodes (3): requireRole(), express, router

### Community 62 - "Compose Volumes"
Cohesion: 0.40
Nodes (5): volumes, ai_models, minio_data, mongo_data, redis_data

### Community 63 - "Joi Video Validator"
Cohesion: 0.50
Nodes (3): joi@^17.13.1, Joi, joi

### Community 65 - "Frontend HTML Shell"
Cohesion: 0.50
Nodes (4): Bricolage Grotesque + JetBrains Mono fonts, frontend index.html, /src/main.jsx entry, TikTak favicon logo (lime circle with eye on dark rounded square)

## Ambiguous Edges - Review These
- `TikTak AI Service` → `Third-party AI APIs first, self-host later`  [AMBIGUOUS]
  plan.md · relation: conceptually_related_to
- `Postman: DELETE /api/admin/videos/:id (200 OK, Video removed successfully, moderationStatus=removed) - file named delete comment but shows delete video` → `Admin delete comment endpoint`  [AMBIGUOUS]
  backend/bao_cao_tuan_4/img/admin/delete comment.png · relation: references
- `Postman: DELETE /api/videos/:id (Bearer) -> 200 'Video deleted successfully'` → `PATCH /api/videos/:id (edit title/description)`  [AMBIGUOUS]
  backend/bao_cao_tuan_4/img/feed/delete video.png · relation: conceptually_related_to
- `Comment` → `Like`  [AMBIGUOUS]
  backend/diagrams/erd.jpg · relation: references

## Knowledge Gaps
- **111 isolated node(s):** `For You Feed`, `Following Feed`, `Admin Audit Log`, `Google OAuth (Passport)`, `FFmpeg (fluent-ffmpeg)` (+106 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 377 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AI Translation & Dubbing Feature` connect `AI Dubbing Feature Plan` to `Whisper & NLLB Models`, `Frontend Known Bugs`, `Backend AI Client`, `Architecture & Roadmap`?**
  _High betweenness centrality (0.088) - this node is a cross-community bridge._
- **What connects `For You Feed`, `Following Feed`, `Admin Audit Log` to the rest of the system?**
  _111 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Frontend API Client Layer` be split into smaller, more focused modules?**
  _Cohesion score 0.050888811432554894 - nodes in this community are weakly interconnected._
- **Why does `Translation and Dubbing Pipeline` connect `Frontend Known Bugs` to `System Architecture Overview`, `AI Dubbing Feature Plan`, `Architecture & Roadmap`?**
  _High betweenness centrality (0.083) - this node is a cross-community bridge._
- **Should `AI Service Python Core` be split into smaller, more focused modules?**
  _Cohesion score 0.058385093167701865 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `TikTak AI Service` and `Third-party AI APIs first, self-host later`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Postman: DELETE /api/admin/videos/:id (200 OK, Video removed successfully, moderationStatus=removed) - file named delete comment but shows delete video` and `Admin delete comment endpoint`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._