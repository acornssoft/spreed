Feature: chat-4/threads
  Background:
    Given user "participant1" exists
    Given user "participant2" exists

  Scenario: Create a thread
    Given user "participant1" creates room "room" (v4)
      | roomType | 2 |
      | roomName | room |
    And user "participant1" adds user "participant2" to room "room" with 200 (v4)
    And user "participant1" sends thread "Thread 1" with message "Message 1" to room "room" with 201
    Then user "participant1" sees the following recent threads in room "room" with 200
      | t.id      | t.title  | t.numReplies | t.lastMessage | a.notificationLevel | firstMessage | lastMessage |
      | Message 1 | Thread 1 | 0            | 0             | 0                   | Message 1    | NULL        |

  Scenario: Create thread and reply
    Given user "participant1" creates room "room" (v4)
      | roomType | 2 |
      | roomName | room |
    And user "participant1" adds user "participant2" to room "room" with 200 (v4)
    And user "participant1" sends thread "Thread 1" with message "Message 1" to room "room" with 201
    And user "participant2" sends reply "Message 1-1" on message "Message 1" to room "room" with 201
    Then user "participant1" sees the following recent threads in room "room" with 200
      | t.id      | t.title  | t.numReplies | t.lastMessage | a.notificationLevel | firstMessage | lastMessage |
      | Message 1 | Thread 1 | 1            |  Message 1-1  | 0                   | Message 1    | Message 1-1 |
    Then user "participant1" sees the following messages in room "room" with 200
      | room | actorType | actorId      | actorDisplayName         | message     | messageParameters | parentMessage | threadTitle | threadReplies |
      | room | users     | participant2 | participant2-displayname | Message 1-1 | []                | Message 1     | Thread 1    | 1             |
      | room | users     | participant1 | participant1-displayname | Message 1   | []                |               | Thread 1    | 1             |
    Then user "participant1" sees the following system messages in room "room" with 200
      | room | actorType     | actorId      | systemMessage        | message                        | silent | messageParameters |
      | room | users         | participant1 | thread_created       | You created thread {title} | true   | {"actor":{"type":"user","id":"participant1","name":"participant1-displayname","mention-id":"participant1"},"title":{"type":"highlight","id":THREAD_ID(Thread 1),"name":"Thread 1"}} |
      | room | users         | participant1 | user_added           | You added {user}               | !ISSET | {"actor":{"type":"user","id":"participant1","name":"participant1-displayname","mention-id":"participant1"},"user":{"type":"user","id":"participant2","name":"participant2-displayname","mention-id":"participant2"}} |
      | room | users         | participant1 | conversation_created | You created the conversation   | !ISSET | {"actor":{"type":"user","id":"participant1","name":"participant1-displayname","mention-id":"participant1"}} |
    And user "participant1" renames thread "Thread 1" to "Thredited 1" in room "room" with 200
    Then user "participant1" sees the following recent threads in room "room" with 200
      | t.id      | t.title     | t.numReplies | t.lastMessage | a.notificationLevel | firstMessage | lastMessage |
      | Message 1 | Thredited 1 | 1            | Message 1-1   | 0                   | Message 1    | Message 1-1 |
    Then user "participant1" sees the following messages in room "room" with 200
      | room | actorType | actorId      | actorDisplayName         | message     | messageParameters | parentMessage |
      | room | users     | participant2 | participant2-displayname | Message 1-1 | []                | Message 1     |
      | room | users     | participant1 | participant1-displayname | Message 1   | []                |               |
    Then user "participant2" sees the following system messages in room "room" with 200
      | room | actorType     | actorId      | systemMessage        | message                        | silent | messageParameters |
      | room | users         | participant1 | thread_renamed       | {actor} renamed thread {title} | true   | {"actor":{"type":"user","id":"participant1","name":"participant1-displayname","mention-id":"participant1"},"title":{"type":"highlight","id":THREAD_ID(Thread 1),"name":"Thredited 1"}} |
      | room | users         | participant1 | thread_created       | {actor} created thread {title} | true   | {"actor":{"type":"user","id":"participant1","name":"participant1-displayname","mention-id":"participant1"},"title":{"type":"highlight","id":THREAD_ID(Thread 1),"name":"Thread 1"}} |
      | room | users         | participant1 | user_added           | {actor} added you              | !ISSET | {"actor":{"type":"user","id":"participant1","name":"participant1-displayname","mention-id":"participant1"},"user":{"type":"user","id":"participant2","name":"participant2-displayname","mention-id":"participant2"}} |
      | room | users         | participant1 | conversation_created | {actor} created the conversation | !ISSET | {"actor":{"type":"user","id":"participant1","name":"participant1-displayname","mention-id":"participant1"}} |

  Scenario: Non moderators can only rename their own threads
    Given user "participant1" creates room "room" (v4)
      | roomType | 2 |
      | roomName | room |
    And user "participant1" adds user "participant2" to room "room" with 200 (v4)
    And user "participant1" sends thread "Thread 1" with message "Message 1" to room "room" with 201
    And user "participant2" sends thread "Thread 2" with message "Message 2" to room "room" with 201
    Then user "participant1" sees the following recent threads in room "room" with 200
      | t.id      | t.title  | t.numReplies | t.lastMessage | a.notificationLevel | firstMessage | lastMessage |
      | Message 2 | Thread 2 | 0            | 0             | 0                   | Message 2    | NULL        |
      | Message 1 | Thread 1 | 0            | 0             | 0                   | Message 1    | NULL        |
    And user "participant2" renames thread "Thread 1" to "No permissions" in room "room" with 403
    And user "participant2" renames thread "Thread 2" to "My own thread" in room "room" with 200
    Then user "participant1" sees the following recent threads in room "room" with 200
      | t.id      | t.title       | t.numReplies | t.lastMessage | a.notificationLevel | firstMessage | lastMessage |
      | Message 2 | My own thread | 0            | 0             | 0                   | Message 2    | NULL        |
      | Message 1 | Thread 1      | 0            | 0             | 0                   | Message 1    | NULL        |
    And user "participant1" renames thread "Thread 1" to "Moderator thread" in room "room" with 200
    And user "participant1" renames thread "Thread 2" to "User thread" in room "room" with 200
    Then user "participant1" sees the following recent threads in room "room" with 200
      | t.id      | t.title          | t.numReplies | t.lastMessage | a.notificationLevel | firstMessage | lastMessage |
      | Message 2 | User thread      | 0            | 0             | 0                   | Message 2    | NULL        |
      | Message 1 | Moderator thread | 0            | 0             | 0                   | Message 1    | NULL        |

  Scenario: Notification levels
    Given user "participant1" creates room "room" (v4)
      | roomType | 2 |
      | roomName | room |
    And user "participant1" adds user "participant2" to room "room" with 200 (v4)
    And user "participant1" sends thread "Thread 1" with message "Message 1" to room "room" with 201
    And user "participant2" sends reply "Message 1-1" on thread "Thread 1" to room "room" with 201
    And user "participant1" has the following notifications
      | app | object_type | object_id | subject |
    And user "participant2" sends reply "Message 1-2" on message "Message 1" to room "room" with 201
    And user "participant1" has the following notifications
      | app    | object_type | object_id        | subject                                                               |
      | spreed | chat        | room/Message 1-2/Thread 1 | participant2-displayname replied to your message in conversation room |
    And user "participant1" subscribes to thread "Message 1" in room "room" with notification level 1 with 200
      | t.id      | t.title  | t.numReplies | t.lastMessage | a.notificationLevel | firstMessage | lastMessage |
      | Message 1 | Thread 1 | 2            | Message 1-2   | 1                   | Message 1    | Message 1-2 |
    And user "participant2" sends reply "Message 1-3" on thread "Thread 1" to room "room" with 201
    And user "participant1" has the following notifications
      | app    | object_type | object_id                 | subject                                                               |
      | spreed | chat        | room/Message 1-3/Thread 1 | participant2-displayname sent a message in conversation room          |
      | spreed | chat        | room/Message 1-2/Thread 1 | participant2-displayname replied to your message in conversation room |
    When user "participant2" sends reply "@participant1" on thread "Thread 1" to room "room" with 201
    Then user "participant1" has the following notifications
      | app    | object_type | object_id                   | subject                                                     |
      | spreed | chat        | room/@participant1/Thread 1 | participant2-displayname mentioned you in conversation room |
      | spreed | chat        | room/Message 1-3/Thread 1   | participant2-displayname sent a message in conversation room          |
      | spreed | chat        | room/Message 1-2/Thread 1   | participant2-displayname replied to your message in conversation room |

  Scenario: Thread titles are trimmed
    Given user "participant1" creates room "room" (v4)
      | roomType | 2 |
      | roomName | room |
    And user "participant1" adds user "participant2" to room "room" with 200 (v4)
    And user "participant1" sends thread "More than 200 chars 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789" with message "Message 1" to room "room" with 201
    Then user "participant1" sees the following recent threads in room "room" with 200
      | t.id      | t.title  | t.numReplies | t.lastMessage | a.notificationLevel | firstMessage | lastMessage |
      | Message 1 | More than 200 chars 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 … | 0            | 0          | 0                   | Message 1    | NULL        |
    Then user "participant1" sees the following system messages in room "room" with 200
      | room | actorType     | actorId      | systemMessage        | message                        | silent | messageParameters |
      | room | users         | participant1 | thread_created       | You created thread {title}     | true   | {"actor":{"type":"user","id":"participant1","name":"participant1-displayname","mention-id":"participant1"},"title":{"type":"highlight","id":THREAD_ID(More than 200 chars 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789),"name":"More than 200 chars 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 \u2026"}} |
      | room | users         | participant1 | user_added           | You added {user}               | !ISSET | {"actor":{"type":"user","id":"participant1","name":"participant1-displayname","mention-id":"participant1"},"user":{"type":"user","id":"participant2","name":"participant2-displayname","mention-id":"participant2"}} |
      | room | users         | participant1 | conversation_created | You created the conversation   | !ISSET | {"actor":{"type":"user","id":"participant1","name":"participant1-displayname","mention-id":"participant1"}} |
    And user "participant1" renames thread "More than 200 chars 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789" to "Still more than 200 chars 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789" in room "room" with 200
    Then user "participant1" sees the following recent threads in room "room" with 200
      | t.id      | t.title     | t.numReplies | t.lastMessage | a.notificationLevel | firstMessage | lastMessage |
      | Message 1 | Still more than 200 chars 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 1234… | 0            | 0             | 0                   | Message 1    | NULL        |
    Then user "participant2" sees the following system messages in room "room" with 200
      | room | actorType     | actorId      | systemMessage        | message                        | silent | messageParameters |
      | room | users         | participant1 | thread_renamed       | {actor} renamed thread {title} | true   | {"actor":{"type":"user","id":"participant1","name":"participant1-displayname","mention-id":"participant1"},"title":{"type":"highlight","id":THREAD_ID(More than 200 chars 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789),"name":"Still more than 200 chars 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 1234\u2026"}} |
      | room | users         | participant1 | thread_created       | {actor} created thread {title} | true   | {"actor":{"type":"user","id":"participant1","name":"participant1-displayname","mention-id":"participant1"},"title":{"type":"highlight","id":THREAD_ID(More than 200 chars 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789),"name":"More than 200 chars 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 123456789 \u2026"}} |
      | room | users         | participant1 | user_added           | {actor} added you              | !ISSET | {"actor":{"type":"user","id":"participant1","name":"participant1-displayname","mention-id":"participant1"},"user":{"type":"user","id":"participant2","name":"participant2-displayname","mention-id":"participant2"}} |
      | room | users         | participant1 | conversation_created | {actor} created the conversation | !ISSET | {"actor":{"type":"user","id":"participant1","name":"participant1-displayname","mention-id":"participant1"}} |

  Scenario: Recent threads are sorted by last activity
    Given user "participant1" creates room "room" (v4)
      | roomType | 2 |
      | roomName | room |
    And user "participant1" adds user "participant2" to room "room" with 200 (v4)
    And user "participant1" sends thread "Thread 1" with message "Message 1" to room "room" with 201
    And user "participant1" sends thread "Thread 2" with message "Message 2" to room "room" with 201
    Then user "participant1" sees the following recent threads in room "room" with 200
      | t.id      | t.title  | t.numReplies | t.lastMessage | a.notificationLevel | firstMessage | lastMessage |
      | Message 2 | Thread 2 | 0            | 0             | 0                   | Message 2    | NULL        |
      | Message 1 | Thread 1 | 0            | 0             | 0                   | Message 1    | NULL        |
    When user "participant1" sends reply "Message 1-1" on message "Message 1" to room "room" with 201
    Then user "participant1" sees the following recent threads in room "room" with 200
      | t.id      | t.title  | t.numReplies | t.lastMessage | a.notificationLevel | firstMessage | lastMessage |
      | Message 1 | Thread 1 | 1            | Message 1-1   | 0                   | Message 1    | Message 1-1 |
      | Message 2 | Thread 2 | 0            | 0             | 0                   | Message 2    | NULL        |

  Scenario: Change notification setting for thread
    Given user "participant1" creates room "room" (v4)
      | roomType | 2 |
      | roomName | room |
    And user "participant1" adds user "participant2" to room "room" with 200 (v4)
    And user "participant1" sends thread "Thread 1" with message "Message 1" to room "room" with 201
    Then user "participant1" sees the following recent threads in room "room" with 200
      | t.id      | t.title  | t.numReplies | t.lastMessage | a.notificationLevel | firstMessage | lastMessage |
      | Message 1 | Thread 1 | 0            | 0             | 0                   | Message 1    | NULL        |
    And user "participant1" subscribes to thread "Message 1" in room "room" with notification level 1 with 200
      | t.id      | t.title  | t.numReplies | t.lastMessage | a.notificationLevel | firstMessage | lastMessage |
      | Message 1 | Thread 1 | 0            | 0             | 1                   | Message 1    | NULL        |
    And user "participant1" subscribes to thread "Message 1" in room "room" with notification level 2 with 200
      | t.id      | t.title  | t.numReplies | t.lastMessage | a.notificationLevel | firstMessage | lastMessage |
      | Message 1 | Thread 1 | 0            | 0             | 2                   | Message 1    | NULL        |
    And user "participant1" subscribes to thread "Message 1" in room "room" with notification level 3 with 200
      | t.id      | t.title  | t.numReplies | t.lastMessage | a.notificationLevel | firstMessage | lastMessage |
      | Message 1 | Thread 1 | 0            | 0             | 3                   | Message 1    | NULL        |
    And user "participant1" subscribes to thread "Message 1" in room "room" with notification level 4 with 400
    And user "participant1" subscribes to thread "Message 1" in room "room" with notification level 0 with 200
      | t.id      | t.title  | t.numReplies | t.lastMessage | a.notificationLevel | firstMessage | lastMessage |
      | Message 1 | Thread 1 | 0            | 0             | 0                   | Message 1    | NULL        |

  Scenario: List of subscribed threads
    Given user "participant1" creates room "room1" (v4)
      | roomType | 2 |
      | roomName | room1 |
    And user "participant1" adds user "participant2" to room "room1" with 200 (v4)
    And user "participant1" sends thread "Thread 1" with message "Message 1" to room "room1" with 201
    Given user "participant2" creates room "room2" (v4)
      | roomType | 2 |
      | roomName | room2 |
    And user "participant2" adds user "participant1" to room "room2" with 200 (v4)
    And user "participant2" sends thread "Thread 2" with message "Message 2" to room "room2" with 201
    And user "participant2" sends thread "Thread 3" with message "Message 3" to room "room2" with 201
    Then user "participant1" sees the following subscribed threads
      | t.id      | t.token | t.title  | t.numReplies | t.lastMessage | a.notificationLevel | firstMessage | lastMessage |
      | Message 1 | room1   | Thread 1 | 0            | 0             | 0                   | Message 1    | NULL        |
    And user "participant1" subscribes to thread "Message 3" in room "room2" with notification level 1 with 200
    Then user "participant1" sees the following subscribed threads
      | t.id      | t.token | t.title  | t.numReplies | t.lastMessage | a.notificationLevel | firstMessage | lastMessage |
      | Message 3 | room2   | Thread 3 | 0            | 0             | 1                   | Message 3    | NULL        |
      | Message 1 | room1   | Thread 1 | 0            | 0             | 0                   | Message 1    | NULL        |
    When user "participant1" sends reply "Message 1-1" on message "Message 1" to room "room1" with 201
    Then user "participant1" sees the following subscribed threads
      | t.id      | t.token | t.title  | t.numReplies | t.lastMessage | a.notificationLevel | firstMessage | lastMessage |
      | Message 1 | room1   | Thread 1 | 1            | Message 1-1   | 0                   | Message 1    | Message 1-1 |
      | Message 3 | room2   | Thread 3 | 0            | 0             | 1                   | Message 3    | NULL        |
    When user "participant1" sends reply "Message 2-1" on message "Message 2" to room "room2" with 201
    Then user "participant1" sees the following subscribed threads
      | t.id      | t.token | t.title  | t.numReplies | t.lastMessage | a.notificationLevel | firstMessage | lastMessage |
      | Message 2 | room2   | Thread 2 | 1            | Message 2-1   | 0                   | Message 2    | Message 2-1 |
      | Message 1 | room1   | Thread 1 | 1            | Message 1-1   | 0                   | Message 1    | Message 1-1 |
      | Message 3 | room2   | Thread 3 | 0            | 0             | 1                   | Message 3    | NULL        |
    Then user "participant1" sees 1 number of subscribed threads with 0 offset
      | t.id      | t.token | t.title  | t.numReplies | t.lastMessage | a.notificationLevel | firstMessage | lastMessage |
      | Message 2 | room2   | Thread 2 | 1            | Message 2-1   | 0                   | Message 2    | Message 2-1 |
    Then user "participant1" sees 1 number of subscribed threads with 1 offset
      | t.id      | t.token | t.title  | t.numReplies | t.lastMessage | a.notificationLevel | firstMessage | lastMessage |
      | Message 1 | room1   | Thread 1 | 1            | Message 1-1   | 0                   | Message 1    | Message 1-1 |

  Scenario: Reply with an attachment
    Given user "participant1" creates room "room1" (v4)
      | roomType | 2 |
      | roomName | room1 |
    And user "participant1" adds user "participant2" to room "room1" with 200 (v4)
    And user "participant1" sends thread "Thread 1" with message "Message 1" to room "room1" with 201
    When user "participant2" shares "welcome.txt" with room "room1"
      | talkMetaData.caption      | Message 2 |
      | talkMetaData.replyTo      | Message 1 |
    Then user "participant1" sees the following messages in room "room1" with 200
      | room  | actorType | actorId      | actorDisplayName         | message   | messageParameters | parentMessage |
      | room1 | users     | participant2 | participant2-displayname | Message 2 | "IGNORE"          | Message 1     |
      | room1 | users     | participant1 | participant1-displayname | Message 1 | []                |               |
    Then user "participant1" sees the following recent threads in room "room1" with 200
      | t.id      | t.token | t.title  | t.numReplies | t.lastMessage | a.notificationLevel | firstMessage | lastMessage |
      | Message 1 | room1   | Thread 1 | 1            | Message 2     | 0                   | Message 1    | Message 2   |
    And user "participant1" has the following notifications
      | app    | object_type | object_id       | subject                                                                |
      | spreed | chat        | room1/Message 2/Thread 1 | participant2-displayname replied to your message in conversation room1 |
    Then user "participant2" sees the following subscribed threads
      | t.id      | t.token | t.title  | t.numReplies | t.lastMessage | a.notificationLevel | firstMessage | lastMessage |
      | Message 1 | room1   | Thread 1 | 1            | Message 2     | 0                   | Message 1    | Message 2   |

  Scenario: Post a message with an attachment (not replying)
    Given user "participant1" creates room "room1" (v4)
      | roomType | 2 |
      | roomName | room1 |
    Given user "participant1" creates room "room2" (v4)
      | roomType | 2 |
      | roomName | room2 |
    And user "participant1" adds user "participant2" to room "room1" with 200 (v4)
    And user "participant1" sends thread "Thread 1" with message "Message 1" to room "room1" with 201
    And user "participant1" sends thread "Thread 2" with message "Message 2" to room "room2" with 201
    When user "participant2" shares "welcome.txt" with room "room1"
      | talkMetaData.caption      | Message 3 |
      | talkMetaData.threadId     | Message 1 |
    When user "participant2" shares "welcome.txt" with room "room1"
      | talkMetaData.caption      | Message 4 |
      | talkMetaData.threadId     | Message 2 |
    Then user "participant1" sees the following messages in room "room1" with 200
      | room  | actorType | actorId      | actorDisplayName         | message   | messageParameters | parentMessage |
      | room1 | users     | participant2 | participant2-displayname | Message 4 | "IGNORE"          |               |
      | room1 | users     | participant2 | participant2-displayname | Message 3 | "IGNORE"          | Message 1     |
      | room1 | users     | participant1 | participant1-displayname | Message 1 | []                |               |
    Then user "participant1" sees the following recent threads in room "room1" with 200
      | t.id      | t.token | t.title  | t.numReplies | t.lastMessage | a.notificationLevel | firstMessage | lastMessage |
      | Message 1 | room1   | Thread 1 | 1            | Message 3     | 0                   | Message 1    | Message 3   |
    Then user "participant1" sees the following recent threads in room "room2" with 200
      | t.id      | t.token | t.title  | t.numReplies | t.lastMessage | a.notificationLevel | firstMessage | lastMessage |
      | Message 2 | room2   | Thread 2 | 0            | 0             | 0                   | Message 2    | NULL        |
    And user "participant1" has the following notifications
      | app | object_type | object_id | subject |
    Then user "participant2" sees the following subscribed threads
      | t.id      | t.token | t.title  | t.numReplies | t.lastMessage | a.notificationLevel | firstMessage | lastMessage |
      | Message 1 | room1   | Thread 1 | 1            | Message 3     | 0                   | Message 1    | Message 3   |

  Scenario: Post a location to a thread
    Given user "participant1" creates room "room1" (v4)
      | roomType | 2 |
      | roomName | room1 |
    Given user "participant1" creates room "room2" (v4)
      | roomType | 2 |
      | roomName | room2 |
    And user "participant1" adds user "participant2" to room "room1" with 200 (v4)
    And user "participant1" sends thread "Thread 1" with message "Message 1" to room "room1" with 201
    And user "participant1" sends thread "Thread 2" with message "Message 2" to room "room2" with 201
    When user "participant2" shares rich-object "geo-location" "geo:52.5450511,13.3741463" '{"name":"Location name","latitude":"52.5450511","longitude":"13.3741463"}' to room "room1" in thread "Message 1" with 201 (v1)
    When user "participant2" shares rich-object "geo-location" "geo:52.5450511,13.3741463" '{"name":"Location name","latitude":"52.5450511","longitude":"13.3741463"}' to room "room1" in thread "Message 2" with 201 (v1)
    Then user "participant1" sees the following messages in room "room1" with 200
      | room  | actorType | actorId      | actorDisplayName         | message   | messageParameters | parentMessage |
      | room1 | users     | participant2 | participant2-displayname | {object}  | "IGNORE"          |               |
      | room1 | users     | participant2 | participant2-displayname | {object}  | "IGNORE"          | Message 1     |
      | room1 | users     | participant1 | participant1-displayname | Message 1 | []                |               |
    Then user "participant1" sees the following recent threads in room "room1" with 200
      | t.id      | t.token | t.title  | t.numReplies | t.lastMessage | a.notificationLevel | firstMessage | lastMessage |
      | Message 1 | room1   | Thread 1 | 1            | {object}      | 0                   | Message 1    | {object}    |
    Then user "participant1" sees the following recent threads in room "room2" with 200
      | t.id      | t.token | t.title  | t.numReplies | t.lastMessage | a.notificationLevel | firstMessage | lastMessage |
      | Message 2 | room2   | Thread 2 | 0            | 0             | 0                   | Message 2    | NULL        |
    And user "participant1" has the following notifications
      | app | object_type | object_id | subject |
    Then user "participant2" sees the following subscribed threads
      | t.id      | t.token | t.title  | t.numReplies | t.lastMessage | a.notificationLevel | firstMessage | lastMessage |
      | Message 1 | room1   | Thread 1 | 1            | {object}      | 0                   | Message 1    | {object}    |

  Scenario: Post a location to a thread
    Given user "participant1" creates room "room1" (v4)
      | roomType | 2 |
      | roomName | room1 |
    Given user "participant1" creates room "room2" (v4)
      | roomType | 2 |
      | roomName | room2 |
    And user "participant1" adds user "participant2" to room "room1" with 200 (v4)
    And user "participant1" sends thread "Thread 1" with message "Message 1" to room "room1" with 201
    And user "participant1" sends thread "Thread 2" with message "Message 2" to room "room2" with 201
    When user "participant2" creates a poll in room "room1" with 201
      | question   | What is the question?1 |
      | options    | ["Where are you?","How much is the fish?"] |
      | resultMode | public |
      | maxVotes   | unlimited |
      | threadId   | Thread 1 |
    When user "participant1" creates a poll in room "room1" with 201
      | question   | What is the question?2 |
      | options    | ["Where are you?","How much is the fish?"] |
      | resultMode | public |
      | maxVotes   | unlimited |
      | threadId   | Thread 2 |
    Then user "participant1" sees the following messages in room "room1" with 200
      | room  | actorType | actorId      | actorDisplayName         | message   | messageParameters | parentMessage |
      | room1 | users     | participant1 | participant1-displayname | {object}  | "IGNORE"          |               |
      | room1 | users     | participant2 | participant2-displayname | {object}  | "IGNORE"          | Message 1     |
      | room1 | users     | participant1 | participant1-displayname | Message 1 | []                |               |
    Then user "participant1" sees the following recent threads in room "room1" with 200
      | t.id      | t.token | t.title  | t.numReplies | t.lastMessage | a.notificationLevel | firstMessage | lastMessage |
      | Message 1 | room1   | Thread 1 | 1            | {object}      | 0                   | Message 1    | {object}    |
    Then user "participant1" sees the following recent threads in room "room2" with 200
      | t.id      | t.token | t.title  | t.numReplies | t.lastMessage | a.notificationLevel | firstMessage | lastMessage |
      | Message 2 | room2   | Thread 2 | 0            | 0             | 0                   | Message 2    | NULL        |
    And user "participant1" has the following notifications
      | app | object_type | object_id | subject |
    Then user "participant2" sees the following subscribed threads
      | t.id      | t.token | t.title  | t.numReplies | t.lastMessage | a.notificationLevel | firstMessage | lastMessage |
      | Message 1 | room1   | Thread 1 | 1            | {object}      | 0                   | Message 1    | {object}    |

  Scenario: acorns - Creating a thread from a message does not fold existing replies
    Given user "participant1" creates room "room" (v4)
      | roomType | 2 |
      | roomName | room |
    And user "participant1" adds user "participant2" to room "room" with 200 (v4)
    And user "participant1" sends message "Message 1" to room "room" with 201
    And user "participant2" sends reply "Reply 1" on message "Message 1" to room "room" with 201
    And user "participant2" sends reply "Reply 2" on message "Message 1" to room "room" with 201
    When user "participant1" creates thread from message "Message 1" in room "room" with 200
    Then user "participant1" sees the following recent threads in room "room" with 200
      | t.id      | t.title   | t.numReplies | t.lastMessage | a.notificationLevel | firstMessage | lastMessage |
      | Message 1 | Message 1 | 0            | 0             | 0                   | Message 1    | NULL        |
    Then user "participant1" sees the following messages in room "room" with 200
      | room | actorType | actorId      | actorDisplayName         | message   | messageParameters | parentMessage |
      | room | users     | participant2 | participant2-displayname | Reply 2   | []                | Message 1     |
      | room | users     | participant2 | participant2-displayname | Reply 1   | []                | Message 1     |
      | room | users     | participant1 | participant1-displayname | Message 1 | []                |               |

  Scenario: acorns - Quote-replying to a thread starter stays in the channel
    Given user "participant1" creates room "room" (v4)
      | roomType | 2 |
      | roomName | room |
    And user "participant1" adds user "participant2" to room "room" with 200 (v4)
    And user "participant1" sends message "Message 1" to room "room" with 201
    And user "participant1" creates thread from message "Message 1" in room "room" with 200
    When user "participant2" sends reply "Reply 1" on message "Message 1" to room "room" without thread with 201
    Then user "participant1" sees the following recent threads in room "room" with 200
      | t.id      | t.title   | t.numReplies | t.lastMessage | a.notificationLevel | firstMessage | lastMessage |
      | Message 1 | Message 1 | 0            | 0             | 0                   | Message 1    | NULL        |
    Then user "participant1" sees the following messages in room "room" with 200
      | room | actorType | actorId      | actorDisplayName         | message   | messageParameters | parentMessage | threadTitle | threadReplies |
      | room | users     | participant2 | participant2-displayname | Reply 1   | []                | Message 1     |             |               |
      | room | users     | participant1 | participant1-displayname | Message 1 | []                |               | Message 1   | 0             |

  Scenario: acorns - Replying to a thread starter without threadId inherits the thread
    Given user "participant1" creates room "room" (v4)
      | roomType | 2 |
      | roomName | room |
    And user "participant1" adds user "participant2" to room "room" with 200 (v4)
    And user "participant1" sends message "Message 1" to room "room" with 201
    And user "participant1" creates thread from message "Message 1" in room "room" with 200
    When user "participant2" sends reply "Reply 1" on message "Message 1" to room "room" with 201
    Then user "participant1" sees the following recent threads in room "room" with 200
      | t.id      | t.title   | t.numReplies | t.lastMessage | a.notificationLevel | firstMessage | lastMessage |
      | Message 1 | Message 1 | 1            | Reply 1       | 0                   | Message 1    | Reply 1     |
    Then user "participant1" sees the following messages in room "room" with 200
      | room | actorType | actorId      | actorDisplayName         | message   | messageParameters | parentMessage | threadTitle | threadReplies |
      | room | users     | participant2 | participant2-displayname | Reply 1   | []                | Message 1     | Message 1   | 1             |
      | room | users     | participant1 | participant1-displayname | Message 1 | []                |               | Message 1   | 1             |

  Scenario: acorns - Reacting to a thread reply keeps the reply inside the thread
    Given user "participant1" creates room "room" (v4)
      | roomType | 2 |
      | roomName | room |
    And user "participant1" adds user "participant2" to room "room" with 200 (v4)
    And user "participant1" sends message "Message 1" to room "room" with 201
    And user "participant1" creates thread from message "Message 1" in room "room" with 200
    And user "participant2" sends reply "Reply 1" on message "Message 1" to room "room" with 201
    When user "participant1" react with "👍" on message "Reply 1" to room "room" with 201
      | actorType | actorId      | actorDisplayName         | reaction |
      | users     | participant1 | participant1-displayname | 👍       |
    # リアクションのコメントは親(Reply 1)の thread_id を継承し、
    # parent として返る Reply 1 もスレッド所属(isThread/threadTitle)を保つ
    Then user "participant1" sees the following system messages in room "room" with 200
      | room | actorType | actorId      | systemMessage        | threadTitle | parentThreadTitle |
      | room | users     | participant1 | reaction             | Message 1   | Message 1         |
      | room | users     | participant1 | thread_created       | Message 1   | Message 1         |
      | room | users     | participant1 | user_added           |             |                   |
      | room | users     | participant1 | conversation_created |             |                   |
    And user "participant1" sees the following recent threads in room "room" with 200
      | t.id      | t.title   | t.numReplies | t.lastMessage | a.notificationLevel | firstMessage | lastMessage |
      | Message 1 | Message 1 | 1            | Reply 1       | 0                   | Message 1    | Reply 1     |

  Scenario: acorns - Thread replies do not count as unread in the conversation
    Given user "participant1" creates room "room" (v4)
      | roomType | 2 |
      | roomName | room |
    And user "participant1" adds user "participant2" to room "room" with 200 (v4)
    And user "participant1" sends message "Message 1" to room "room" with 201
    And user "participant1" creates thread from message "Message 1" in room "room" with 200
    And user "participant2" reads message "Message 1" in room "room" with 200
    # スレッド返信: 会話の未読にならない
    When user "participant1" sends reply "Thread reply" on message "Message 1" to room "room" with 201
    Then user "participant2" is participant of the following rooms (v4)
      | id   | unreadMessages | unreadThreads |
      | room | 0              | 0             |
    # 引用返信(threadId=-2): チャンネルに残るので未読になる
    When user "participant1" sends reply "Quote reply" on message "Message 1" to room "room" without thread with 201
    Then user "participant2" is participant of the following rooms (v4)
      | id   | unreadMessages | unreadThreads |
      | room | 1              | 0             |
    # 新しい起点: 未読になる
    When user "participant1" sends message "Message 2" to room "room" with 201
    Then user "participant2" is participant of the following rooms (v4)
      | id   | unreadMessages | unreadThreads |
      | room | 2              | 0             |

  Scenario: acorns - unreadThreads counts threads the user is tracked in
    Given user "participant1" creates room "room" (v4)
      | roomType | 2 |
      | roomName | room |
    And user "participant1" adds user "participant2" to room "room" with 200 (v4)
    And user "participant1" sends message "Message 1" to room "room" with 201
    And user "participant1" creates thread from message "Message 1" in room "room" with 200
    And user "participant1" sends message "Message 2" to room "room" with 201
    And user "participant1" creates thread from message "Message 2" in room "room" with 200
    # participant2 は両スレッドに返信 → 追跡対象
    And user "participant2" sends reply "Reply A" on message "Message 1" to room "room" with 201
    And user "participant2" sends reply "Reply B" on message "Message 2" to room "room" with 201
    When user "participant1" sends reply "Reply A2" on message "Message 1" to room "room" with 201
    And user "participant1" sends reply "Reply B2" on message "Message 2" to room "room" with 201
    Then user "participant2" is participant of the following rooms (v4)
      | id   | unreadThreads |
      | room | 2             |
    # participant1 は自分の返信までは既読なので 0
    And user "participant1" is participant of the following rooms (v4)
      | id   | unreadThreads |
      | room | 0             |

  Scenario: acorns - Replier sees unread count in a thread and can mark it read
    Given user "participant1" creates room "room" (v4)
      | roomType | 2 |
      | roomName | room |
    And user "participant1" adds user "participant2" to room "room" with 200 (v4)
    And user "participant1" sends message "Message 1" to room "room" with 201
    And user "participant1" creates thread from message "Message 1" in room "room" with 200
    And user "participant2" sends reply "Reply 1" on message "Message 1" to room "room" with 201
    When user "participant1" sends reply "Reply 2" on message "Message 1" to room "room" with 201
    And user "participant1" sends reply "Reply 3" on message "Message 1" to room "room" with 201
    Then user "participant2" sees the following recent threads in room "room" with 200
      | t.id      | t.title   | t.numReplies | t.lastMessage | a.notificationLevel | a.lastReadMessage | a.unreadMessages | firstMessage | lastMessage |
      | Message 1 | Message 1 | 3            | Reply 3       | 0                   | Reply 1           | 2                | Message 1    | Reply 3     |
    When user "participant2" reads thread "Message 1" up to message "Reply 2" in room "room" with 200
      | t.id      | t.title   | t.numReplies | t.lastMessage | a.notificationLevel | a.lastReadMessage | a.unreadMessages | firstMessage | lastMessage |
      | Message 1 | Message 1 | 3            | Reply 3       | 0                   | Reply 2           | 1                | Message 1    | Reply 3     |
    And user "participant2" reads thread "Message 1" in room "room" with 200
      | t.id      | t.title   | t.numReplies | t.lastMessage | a.notificationLevel | a.lastReadMessage | a.unreadMessages | firstMessage | lastMessage |
      | Message 1 | Message 1 | 3            | Reply 3       | 0                   | Reply 3           | 0                | Message 1    | Reply 3     |
    # 後戻りは 400
    And user "participant2" reads thread "Message 1" up to message "Reply 1" in room "room" with 400

  Scenario: acorns - Reading a thread does not move the conversation read marker
    Given user "participant1" creates room "room" (v4)
      | roomType | 2 |
      | roomName | room |
    And user "participant1" adds user "participant2" to room "room" with 200 (v4)
    And user "participant1" sends message "Message 1" to room "room" with 201
    And user "participant1" creates thread from message "Message 1" in room "room" with 200
    And user "participant2" sends reply "Reply 1" on message "Message 1" to room "room" with 201
    And user "participant1" sends message "Message 2" to room "room" with 201
    And user "participant1" sends reply "Reply 2" on message "Message 1" to room "room" with 201
    When user "participant2" reads thread "Message 1" in room "room" with 200
    Then user "participant2" is participant of the following rooms (v4)
      | id   | lastReadMessage | unreadMessages | unreadThreads |
      | room | Reply 1         | 1              | 0             |

  Scenario: acorns - Users not tracked in a thread get neutral read info and can not mark it
    Given user "participant1" creates room "room" (v4)
      | roomType | 2 |
      | roomName | room |
    And user "participant1" adds user "participant2" to room "room" with 200 (v4)
    And user "participant1" sends message "Message 1" to room "room" with 201
    And user "participant1" creates thread from message "Message 1" in room "room" with 200
    And user "participant1" sends reply "Reply 1" on message "Message 1" to room "room" with 201
    Then user "participant2" sees the following recent threads in room "room" with 200
      | t.id      | t.title   | t.numReplies | t.lastMessage | a.notificationLevel | a.lastReadMessage | a.unreadMessages | firstMessage | lastMessage |
      | Message 1 | Message 1 | 1            | Reply 1       | 0                   | 0                 | 0                | Message 1    | Reply 1     |
    When user "participant2" reads thread "Message 1" in room "room" with 200
      | t.id      | t.title   | t.numReplies | t.lastMessage | a.notificationLevel | a.lastReadMessage | a.unreadMessages | firstMessage | lastMessage |
      | Message 1 | Message 1 | 1            | Reply 1       | 0                   | 0                 | 0                | Message 1    | Reply 1     |

  Scenario: acorns - Being mentioned in a thread starts tracking it with one unread message
    Given user "participant1" creates room "room" (v4)
      | roomType | 2 |
      | roomName | room |
    And user "participant1" adds user "participant2" to room "room" with 200 (v4)
    And user "participant1" sends message "Message 1" to room "room" with 201
    And user "participant1" creates thread from message "Message 1" in room "room" with 200
    And user "participant1" sends reply "Reply 1" on message "Message 1" to room "room" with 201
    When user "participant1" sends reply "Hello @participant2" on message "Message 1" to room "room" with 201
    Then user "participant2" sees the following recent threads in room "room" with 200
      | t.id      | t.title   | t.numReplies | t.lastMessage       | a.notificationLevel | a.lastReadMessage | a.unreadMessages | firstMessage | lastMessage         |
      | Message 1 | Message 1 | 2            | Hello @participant2 | 0                   | Reply 1           | 1                | Message 1    | Hello @participant2 |
