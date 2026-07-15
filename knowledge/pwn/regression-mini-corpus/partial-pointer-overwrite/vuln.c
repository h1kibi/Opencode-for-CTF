#include <stdio.h>
#include <unistd.h>

void win(void) { puts("flag{test}"); }
void safe(void) { puts("safe"); }

int main(void) {
    void (*fp)(void) = safe;
    char buf[8];
    setvbuf(stdout, NULL, _IONBF, 0);
    read(0, buf, 9);
    ((char *)&fp)[0] = buf[8];
    fp();
    return 0;
}
