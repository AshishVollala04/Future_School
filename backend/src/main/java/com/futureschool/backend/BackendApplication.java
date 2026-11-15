package com.futureschool.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import com.futureschool.backend.tenant.TenantSafeRepository;

@SpringBootApplication
// Every repository routes by-id loads/saves through school-filtered queries.
@EnableJpaRepositories(repositoryBaseClass = TenantSafeRepository.class)
public class BackendApplication {

	public static void main(String[] args) {
		SpringApplication.run(BackendApplication.class, args);
	}

}
