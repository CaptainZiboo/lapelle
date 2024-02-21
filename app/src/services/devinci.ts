import {
  DiscordError,
  NoCourseToday,
  NoCurrentCourse,
  NoGroupFound,
  NoNextCourse,
} from "../core/utils/errors";
import { Course, Portail, PresenceStatus, Week } from "./portail";
import { Group, groups } from "../core/database/entities/groups";
import { db } from "../core/database";
import { and, eq, inArray } from "drizzle-orm";
import { User, users, usersToGroups } from "../core/database/entities";
import cache from "../core/utils/cache";
import { logger } from "../core/utils/logger";

interface _Meta {
  unprocessed?: string[];
}

export interface _Response<T> {
  data: T;
  meta?: _Meta;
}

export interface Options {
  portail?: Portail;
}

export class Devinci {
  constructor() {}

  cacheGroupsTodayCourses(groupNames: string[], courses: Course[]) {
    for (const group of groupNames) {
      cache.courses.today.set(
        group,
        courses.filter((c) => c.groups.includes(group))
      );
    }
  }

  mergeTodayCourses(courses: (Course[] | undefined)[]): Course[] {
    let merged: Course[] = [];

    for (const list of courses) {
      if (!list) continue;
      merged = [
        ...merged,
        ...list.filter((course) => !merged.some((c) => c._id === course._id)),
      ];
    }

    return merged.sort(
      (a, b) => a.time.beginning.getTime() - b.time.beginning.getTime()
    );
  }

  cacheGroupsWeekCourses(groupNames: string[], week: Week) {
    for (const group of groupNames) {
      const filtered = Object.assign({}, week);

      filtered.days = filtered.days.map((day) => {
        return {
          ...day,
          courses: day.courses.filter((course) =>
            course.groups.includes(group)
          ),
        };
      });

      cache.courses.week.set(group, filtered);
    }
  }

  mergeWeekCourses(weeks: (Week | undefined)[]): Week | undefined {
    if (!weeks.length) throw new Error("No weeks to merge");

    const merged = weeks.reduce<Week | undefined>((acc, week) => {
      if (!acc) {
        return week;
      }

      if (!week) {
        return acc;
      }

      return {
        ...acc,
        days: acc.days.map((day, i) => ({
          ...day,
          courses: [
            ...day.courses,
            ...week.days[i].courses.filter(
              (course) => !day.courses.some((c) => c._id === course._id)
            ),
          ].sort(
            (a, b) => a.time.beginning.getTime() - b.time.beginning.getTime()
          ),
        })),
      };
    }, undefined);

    return merged;
  }

  async getUserTodayCourses(user: User): Promise<_Response<Course[]>> {
    // All groups of the user
    const result = await db.query.users.findFirst({
      where: eq(users._id, user._id),
      with: {
        groups: {
          with: {
            group: true,
          },
        },
      },
    });

    if (!result) {
      throw new NoGroupFound();
    }

    const allUserGroups = result.groups;

    // If user has no group, throw error
    if (!allUserGroups.length) {
      throw new NoGroupFound();
    }

    // Verified groups
    const verifiedUserGroups = allUserGroups.filter(
      ({ group }) => group.verified
    );

    let value: _Response<Course[]> = {
      data: [],
    };

    const cached = verifiedUserGroups.reduce<string[]>((acc, { group }) => {
      const data = cache.courses.today.get<Course[]>(group.name);

      if (data) {
        value.data = this.mergeTodayCourses([value.data, data]);
        acc.push(group.name);
      }

      return acc;
    }, []);

    if (
      user.credentials &&
      !verifiedUserGroups
        .filter((g) => g.verified)
        .every(({ group }) => cached.includes(group.name))
    ) {
      // Using portal service to get user courses
      const portail = new Portail(user);
      const courses = await portail.use<Course[]>((p) => p.getTodayCourses());

      value.data = this.mergeTodayCourses([courses, value.data]);
    }

    // Get groups where user is not verified
    const noSyncUserGroups = allUserGroups.reduce<string[]>(
      (acc, { group, verified }) => {
        if (!verified && !cached.includes(group.name)) {
          acc.push(group.name);
        }
        return acc;
      },
      []
    );

    if (noSyncUserGroups.length) {
      // Get courses from groups where user is not verified
      const { data: courses, meta } = await this.getGroupsTodayCourses(
        noSyncUserGroups
      );

      value = {
        data: this.mergeTodayCourses([value.data, courses]),
        meta,
      };
    }

    // If no courses from portal and no courses from groups, throw error
    if (!value?.data?.length) {
      throw new NoCourseToday();
    }

    this.cacheGroupsTodayCourses(
      allUserGroups.reduce<string[]>((acc, { group }) => {
        if (!value?.meta?.unprocessed?.includes(group.name))
          acc.push(group.name);

        return acc;
      }, []),
      value.data
    );

    return value;
  }

  async getUserWeekCourses(user: User): Promise<_Response<Week | undefined>> {
    // Retrieve user with groups from database
    const result = await db.query.users.findFirst({
      where: eq(users._id, user._id),
      with: {
        groups: {
          with: {
            group: true,
          },
        },
      },
    });

    if (!result) {
      throw new NoGroupFound();
    }

    const allUserGroups = result.groups;

    // If user has no group, throw error
    if (!allUserGroups.length) {
      throw new NoGroupFound();
    }

    // Verified groups
    const verifiedUserGroups = allUserGroups.filter(
      ({ group }) => group.verified
    );

    let value: _Response<Week | undefined> = {
      data: undefined,
    };

    const cached = verifiedUserGroups.reduce<string[]>((acc, { group }) => {
      const data = cache.courses.week.get<Week>(group.name);

      if (data) {
        value = {
          data: value ? this.mergeWeekCourses([value.data, data]) : data,
        };
        acc.push(group.name);
      }

      return acc;
    }, []);

    if (
      user.credentials &&
      !verifiedUserGroups
        .filter((g) => g.verified)
        .every(({ group }) => cached.includes(group.name))
    ) {
      // Using portal service to get user courses
      const portail = new Portail(user);
      const week = await portail.use<Week>((p) => p.getWeekCourses());

      // If error while getting courses, throw error
      if (!week) {
        throw new Error("Error while retrieving week data");
      }

      value = {
        data: value ? this.mergeWeekCourses([value.data, week]) : week,
      };
    }

    const noSyncUserGroups = allUserGroups.reduce<string[]>(
      (acc, { group, verified }) => {
        if (!verified && !cached.includes(group.name)) {
          acc.push(group.name);
        }
        return acc;
      },
      []
    );

    if (noSyncUserGroups.length) {
      // Get courses from groups where user is not verified
      const { data: week, meta } = await this.getGroupsWeekCourses(
        noSyncUserGroups
      );

      value = {
        data: value ? this.mergeWeekCourses([value.data, week]) : week,
        meta,
      };
    }

    // If no courses from portal and no courses from groups, throw error
    if (!value?.data?.days.length) throw new NoCourseToday();

    this.cacheGroupsWeekCourses(
      allUserGroups.reduce<string[]>((acc, { group }) => {
        if (!value?.meta?.unprocessed?.includes(group.name))
          acc.push(group.name);

        return acc;
      }, []),
      value.data
    );

    return value;
  }

  async getUserCurrentCourse(user: User): Promise<_Response<Course>> {
    const { data: courses, meta } = await this.getUserTodayCourses(user);

    if (!courses) throw new NoCourseToday();

    const now = new Date();

    const current = courses.find(
      (course) =>
        course.time.beginning.getTime() <= now.getTime() &&
        course.time.end.getTime() >= now.getTime()
    );

    if (!current) {
      throw new NoCurrentCourse();
    }

    return {
      data: current,
      meta,
    };
  }

  async getUserNextCourse(user: User): Promise<_Response<Course>> {
    const { data: courses, meta } = await this.getUserTodayCourses(user);

    if (!courses) throw new NoCourseToday();

    const now = new Date();

    const course = courses.find(
      (course) => course.time.beginning.getTime() > now.getTime()
    );

    if (!course) {
      throw new NoNextCourse();
    }

    return {
      data: course,
      meta,
    };
  }

  async getGroupsTodayCourses(
    groupNames: string[]
  ): Promise<_Response<Course[]>> {
    const selected = await db.query.groups.findMany({
      where: and(inArray(groups.name, groupNames), eq(groups.verified, true)),
      with: {
        users: {
          where: eq(usersToGroups.verified, true),
          with: {
            user: true,
          },
        },
      },
    });

    // List of groups where courses have been retrieved
    const processed = new Set<string>();

    // List of courses
    const courses: Course[] = [];

    for (const group of selected) {
      const { user, syncUserGroups } = group.users.reduce<{
        user: User;
        syncUserGroups: Group[];
      }>(
        (acc, { user }) => {
          const syncUserGroups = selected.filter((g) =>
            g.users.some((u) => u.user._id === user._id)
          );

          if (syncUserGroups.length > acc.syncUserGroups.length) {
            return {
              user,
              syncUserGroups,
            };
          }

          return acc;
        },
        {
          user: group.users[0].user,
          syncUserGroups: [],
        }
      );

      // Try to get courses from user portal
      const portail = new Portail(user);

      try {
        const syncGroupsCourses = await portail.use<Course[]>((p) =>
          p.getTodayCourses()
        );

        if (!syncGroupsCourses) {
          continue;
        }

        // Else, add courses to list
        courses.push(...syncGroupsCourses);

        // Add user groups to done list
        syncUserGroups.forEach((group) => processed.add(group.name));

        // If all groups have been done, break loop
        if (selected.every((group) => processed.has(group.name))) break;
      } catch (error: any) {
        logger.error("Error from devinci.getGroupsTodayCourses");
        logger.error(error.stack);
        if (!(error instanceof DiscordError)) {
          throw error;
        }
        // If error while retrieving courses, continue
        continue;
      }
    }

    return {
      data: courses,
      meta: {
        unprocessed: groupNames.filter((group) => !processed.has(group)),
      },
    };
  }

  async getGroupsWeekCourses(
    groupNames: string[]
  ): Promise<_Response<Week | undefined>> {
    const selected = await db.query.groups.findMany({
      where: inArray(groups.name, groupNames),
      with: {
        users: {
          where: eq(usersToGroups.verified, true),
          with: {
            user: true,
          },
        },
      },
    });

    // List of groups where courses have been retrieved
    const processed = new Set<string>();

    let value: _Response<Week | undefined> = {
      data: undefined,
    };

    for (const group of selected) {
      if (!group.users.length || processed.has(group.name)) continue;

      const { user, syncUserGroups } = group.users.reduce<{
        user: User;
        syncUserGroups: Group[];
      }>(
        (acc, { user }) => {
          const syncUserGroups = selected.filter(
            (g) => g.verified && g.users.some((u) => u.user._id === user._id)
          );

          if (syncUserGroups.length > acc.syncUserGroups.length) {
            return {
              user,
              syncUserGroups,
            };
          }

          return acc;
        },
        {
          user: group.users[0].user,
          syncUserGroups: [],
        }
      );

      // Try to get courses from user portal
      const portail = new Portail(user);
      try {
        const syncGroupsWeek = await portail.use<Week>((p) =>
          p.getWeekCourses()
        );

        // If error while retrieving courses, continue
        if (!syncGroupsWeek) {
          continue;
        }

        // Else, add courses to list
        value = {
          data: value
            ? this.mergeWeekCourses([value.data, syncGroupsWeek])
            : syncGroupsWeek,
        };

        // Add user groups to done list
        syncUserGroups.forEach((group) => processed.add(group.name));

        // If all groups have been done, break loop
        if (selected.every((group) => processed.has(group.name))) break;
      } catch (error: any) {
        logger.error("Error from devinci.getGroupsWeekCourses");
        logger.error(error.stack);
        if (!(error instanceof DiscordError)) {
          throw error;
        }
        // If error while retrieving courses, continue
        continue;
      }
    }

    return {
      ...value,
      meta: {
        unprocessed: groupNames.filter((group) => !processed.has(group)),
      },
    };
  }

  async getUserPresence(
    user: User
  ): Promise<_Response<PresenceStatus | undefined>> {
    const { data: current, meta } = await this.getUserCurrentCourse(user);

    if (!current) {
      throw new NoCurrentCourse();
    }

    const cached = cache.presences.get<PresenceStatus>(current._id);

    if (cached) {
      return {
        data: cached,
        meta,
      };
    }

    const group = await db.query.groups.findFirst({
      where: and(
        eq(groups.verified, true),
        inArray(groups.name, current.groups)
      ),
      with: {
        users: {
          where: eq(usersToGroups.verified, true),
          with: {
            user: true,
          },
        },
      },
    });

    if (!group) {
      throw new NoGroupFound();
    }

    // If no user in group, return unprocessed groups
    if (!group?.users.length) {
      return {
        data: undefined,
        meta: {
          unprocessed: [...(meta?.unprocessed || []), ...current.groups],
        },
      };
    }

    // If user is in group, get presence
    if (
      user.credentials &&
      group?.users.some(({ user: other }) => other._id === user._id)
    ) {
      const portail = new Portail(user);
      const presence = await portail.use<PresenceStatus>((p) =>
        p.getPresence(current)
      );

      presence && cache.presences.set(current._id, presence);

      return {
        data: presence,
        meta,
      };
    } else {
      // If user is not in group, get presence from other user
      for (const { user: other } of group.users) {
        const portail = new Portail(other);
        const presence = await portail.use<PresenceStatus>((p) =>
          p.getPresence(current)
        );

        presence && cache.presences.set(current._id, presence);

        return {
          data: presence,
          meta,
        };
      }
    }

    return {
      data: undefined,
      meta,
    };
  }

  async getGroupsCurrentCourse(
    groupNames: string[]
  ): Promise<_Response<Course>> {
    const { data: courses, meta } = await this.getGroupsTodayCourses(
      groupNames
    );

    if (!courses) throw new NoCourseToday();

    const now = new Date();

    const current = courses.find(
      (course) =>
        course.time.beginning.getTime() <= now.getTime() &&
        course.time.end.getTime() >= now.getTime()
    );

    if (!current) {
      throw new NoCurrentCourse();
    }

    return {
      data: current,
      meta,
    };
  }

  async getGroupsNextCourse(groupNames: string[]): Promise<_Response<Course>> {
    const { data: courses, meta } = await this.getGroupsTodayCourses(
      groupNames
    );

    if (!courses) throw new NoCourseToday();

    const now = new Date();

    const course = courses.find(
      (course) => course.time.beginning.getTime() > now.getTime()
    );

    if (!course) {
      throw new NoNextCourse();
    }

    return {
      data: course,
      meta,
    };
  }

  async getGroupsPresence(
    groupNames: string[]
  ): Promise<_Response<PresenceStatus | undefined>> {
    const { data: current, meta } = await this.getGroupsCurrentCourse(
      groupNames
    );

    if (!current) {
      throw new NoCurrentCourse();
    }

    const currentCourseGroups = await db.query.groups.findMany({
      where: and(
        eq(groups.verified, true),
        inArray(groups.name, current.groups)
      ),
      with: {
        users: {
          where: eq(usersToGroups.verified, true),
          with: {
            user: true,
          },
        },
      },
    });

    if (!currentCourseGroups.length) {
      throw new NoGroupFound();
    }

    const cached = cache.presences.get<PresenceStatus>(current._id);

    if (cached) {
      return {
        data: cached,
        meta,
      };
    }

    const processed = new Set<string>();

    for (const group of currentCourseGroups) {
      // If no user in group, return unprocessed groups
      if (!group?.users.length) continue;

      // If user is in group, get presence
      for (const { user } of group.users) {
        const portail = new Portail(user);
        try {
          const presence = await portail.use<PresenceStatus>((p) =>
            p.getPresence(current)
          );

          processed.add(group.name);

          presence && cache.presences.set(current._id, presence);

          return {
            data: presence,
            meta,
          };
        } catch (error: any) {
          logger.error("Error from devinci.getGroupsPresence");
          logger.error(error.stack);
          if (!(error instanceof DiscordError)) {
            throw error;
          }
          // If error while retrieving courses, continue
          continue;
        }
      }
    }

    return {
      data: undefined,
      meta: {
        unprocessed: meta?.unprocessed?.filter(
          (group) => !processed.has(group)
        ),
      },
    };
  }
}

export const devinci = new Devinci();
