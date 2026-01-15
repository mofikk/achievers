# Archievers FC

## Overview
Archievers FC is a football community management system that tracks players, attendance, subscriptions, payments, and match stats.

## Pages
- Dashboard
- Players
- Payments
- Attendance
- Stats
- Settings

## Current features
- Add Player flow from the Players page (modal form)
- Edit Player details from the Players page
- View player details and delete from the View modal
- Position codes stored as compact values (FW, CM, CDM, CAM, LM, RM, CB, RB, LB, LW, RW)
- Membership tracking with `membership.memberSinceYear`
- Weekly Saturday attendance with date-first workflow and live present/absent summary
- Stats editing with season totals per player
- Card fines tracking with yellow/red payments
- Settings stored in `server/data/settings.json`
- Dashboard synced with payments, activity, and top performers

## Subscription rules
- Yearly subscriptions: `paid` or `pending`
- Monthly subscriptions: `paid`, `incomplete`, or `pending`
- Weekly payments are derived from monthly values (do not store weekly yet)

## Fee policy defaults
- Monthly expected: 3000
- Yearly expected: 5000 in the member's first year, 2500 for later years
- Expected amounts are policy-controlled (read-only in Payments)

## Settings controls
- Fees are controlled by settings values
- Attendance start date and future-date lock are controlled by settings

## Data tools
- CSV exports for players, payments, attendance, and stats

## Dashboard
- Payment status counts for yearly/monthly
- Recent activity timeline
- Top performers by goals, assists, G+A, yellow, red
- Total members and attendance streaks

## Discipline fines
- Fine amounts are configurable in Settings
- Fine statuses: No cards, Pending, Incomplete, Cleared
